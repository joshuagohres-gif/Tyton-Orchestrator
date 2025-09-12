import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

export interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'control' | 'ping' | 'pong';
  runId?: string;
  action?: 'pause' | 'resume' | 'cancel';
  token?: string;
}

export interface ProgressUpdate {
  runId: string;
  stageId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  attempts?: number;
  message?: string;
  progress?: number;
  duration?: number;
  timestamp: number;
}

export interface OrchestrationStatus {
  runId: string;
  projectId: string;
  status: 'starting' | 'running' | 'paused' | 'cancelling' | 'done' | 'error';
  progress: {
    total: number;
    completed: number;
    failed: number;
    percentage: number;
  };
  currentStage?: string;
  message?: string;
  startedAt: number;
  updatedAt: number;
  estimatedCompletion?: number;
}

interface Client {
  id: string;
  ws: WebSocket;
  userId?: string;
  subscribedRuns: Set<string>;
  isAlive: boolean;
  lastActivity: number;
}

class OrchestrationWebSocketServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Client> = new Map();
  private runSubscriptions: Map<string, Set<string>> = new Map(); // runId -> clientIds
  private pingInterval: NodeJS.Timeout | null = null;
  
  constructor(private port: number = 3001) {
    super();
  }

  /**
   * Start WebSocket server
   */
  start(server?: HTTPServer): void {
    if (this.wss) {
      console.warn('WebSocket server already running');
      return;
    }

    // Create WebSocket server
    if (server) {
      this.wss = new WebSocketServer({ server, path: '/ws/orchestrator' });
    } else {
      this.wss = new WebSocketServer({ port: this.port, path: '/ws/orchestrator' });
    }

    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Start heartbeat ping interval
    this.pingInterval = setInterval(() => {
      this.heartbeat();
    }, 30000); // Ping every 30 seconds

    console.log(`🔌 WebSocket server started on ${server ? 'attached server' : `port ${this.port}`}`);
  }

  /**
   * Stop WebSocket server
   */
  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.wss) {
      // Close all client connections
      this.clients.forEach(client => {
        client.ws.close(1000, 'Server shutting down');
      });
      
      this.wss.close(() => {
        console.log('WebSocket server stopped');
      });
      
      this.wss = null;
    }

    this.clients.clear();
    this.runSubscriptions.clear();
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, request: any): void {
    const clientId = uuidv4();
    const client: Client = {
      id: clientId,
      ws,
      subscribedRuns: new Set(),
      isAlive: true,
      lastActivity: Date.now()
    };

    // Authenticate if token provided
    const token = this.extractToken(request);
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        client.userId = decoded.userId;
      } catch (error) {
        console.error('WebSocket auth failed:', error);
        ws.close(1008, 'Invalid authentication');
        return;
      }
    }

    this.clients.set(clientId, client);
    console.log(`👤 Client connected: ${clientId} (user: ${client.userId || 'anonymous'})`);

    // Send welcome message
    this.sendToClient(client, {
      type: 'connected',
      clientId,
      timestamp: Date.now()
    });

    // Set up event handlers
    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('pong', () => this.handlePong(client));
    ws.on('close', () => this.handleDisconnect(client));
    ws.on('error', (error) => this.handleError(client, error));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(client: Client, data: any): void {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;
      client.lastActivity = Date.now();

      switch (message.type) {
        case 'subscribe':
          if (message.runId) {
            this.subscribeToRun(client, message.runId);
          }
          break;

        case 'unsubscribe':
          if (message.runId) {
            this.unsubscribeFromRun(client, message.runId);
          }
          break;

        case 'control':
          if (message.runId && message.action) {
            this.handleControl(client, message.runId, message.action);
          }
          break;

        case 'ping':
          this.sendToClient(client, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Failed to handle WebSocket message:', error);
      this.sendError(client, 'Invalid message format');
    }
  }

  /**
   * Subscribe client to orchestration run updates
   */
  private subscribeToRun(client: Client, runId: string): void {
    client.subscribedRuns.add(runId);
    
    if (!this.runSubscriptions.has(runId)) {
      this.runSubscriptions.set(runId, new Set());
    }
    this.runSubscriptions.get(runId)!.add(client.id);

    console.log(`📡 Client ${client.id} subscribed to run ${runId}`);
    
    this.sendToClient(client, {
      type: 'subscribed',
      runId,
      timestamp: Date.now()
    });

    // Emit subscription event for external handling
    this.emit('subscription', { clientId: client.id, runId, action: 'subscribe' });
  }

  /**
   * Unsubscribe client from orchestration run updates
   */
  private unsubscribeFromRun(client: Client, runId: string): void {
    client.subscribedRuns.delete(runId);
    
    const subscribers = this.runSubscriptions.get(runId);
    if (subscribers) {
      subscribers.delete(client.id);
      if (subscribers.size === 0) {
        this.runSubscriptions.delete(runId);
      }
    }

    console.log(`📡 Client ${client.id} unsubscribed from run ${runId}`);
    
    this.sendToClient(client, {
      type: 'unsubscribed',
      runId,
      timestamp: Date.now()
    });

    // Emit unsubscription event
    this.emit('subscription', { clientId: client.id, runId, action: 'unsubscribe' });
  }

  /**
   * Handle control commands (pause, resume, cancel)
   */
  private handleControl(client: Client, runId: string, action: string): void {
    // Check if client is subscribed to this run
    if (!client.subscribedRuns.has(runId)) {
      this.sendError(client, 'Not subscribed to this run');
      return;
    }

    console.log(`🎮 Control command: ${action} for run ${runId} from client ${client.id}`);
    
    // Emit control event for external handling
    this.emit('control', {
      clientId: client.id,
      userId: client.userId,
      runId,
      action
    });

    // Acknowledge control command
    this.sendToClient(client, {
      type: 'control_ack',
      runId,
      action,
      timestamp: Date.now()
    });
  }

  /**
   * Broadcast progress update to subscribed clients
   */
  broadcastProgress(update: ProgressUpdate): void {
    const subscribers = this.runSubscriptions.get(update.runId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = {
      type: 'progress',
      ...update
    };

    subscribers.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client) {
        this.sendToClient(client, message);
      }
    });

    console.log(`📨 Progress broadcast to ${subscribers.size} clients for run ${update.runId}`);
  }

  /**
   * Broadcast orchestration status update
   */
  broadcastStatus(status: OrchestrationStatus): void {
    const subscribers = this.runSubscriptions.get(status.runId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = {
      type: 'status',
      ...status
    };

    subscribers.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client) {
        this.sendToClient(client, message);
      }
    });
  }

  /**
   * Send message to specific client
   */
  private sendToClient(client: Client, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message to client
   */
  private sendError(client: Client, error: string): void {
    this.sendToClient(client, {
      type: 'error',
      error,
      timestamp: Date.now()
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(client: Client): void {
    console.log(`👋 Client disconnected: ${client.id}`);
    
    // Remove from all subscriptions
    client.subscribedRuns.forEach(runId => {
      const subscribers = this.runSubscriptions.get(runId);
      if (subscribers) {
        subscribers.delete(client.id);
        if (subscribers.size === 0) {
          this.runSubscriptions.delete(runId);
        }
      }
    });

    // Remove client
    this.clients.delete(client.id);
    
    // Emit disconnect event
    this.emit('disconnect', { clientId: client.id, userId: client.userId });
  }

  /**
   * Handle WebSocket error
   */
  private handleError(client: Client, error: Error): void {
    console.error(`WebSocket error for client ${client.id}:`, error);
  }

  /**
   * Handle pong response
   */
  private handlePong(client: Client): void {
    client.isAlive = true;
  }

  /**
   * Send heartbeat ping to all clients
   */
  private heartbeat(): void {
    const now = Date.now();
    const timeout = 60000; // 60 second timeout

    this.clients.forEach((client, clientId) => {
      if (!client.isAlive) {
        // Client didn't respond to last ping
        console.log(`💔 Terminating inactive client: ${clientId}`);
        client.ws.terminate();
        this.clients.delete(clientId);
        return;
      }

      // Check for inactive clients
      if (now - client.lastActivity > timeout * 2) {
        console.log(`⏰ Closing inactive client: ${clientId}`);
        client.ws.close(1000, 'Inactive timeout');
        return;
      }

      // Send ping
      client.isAlive = false;
      client.ws.ping();
    });
  }

  /**
   * Extract token from request
   */
  private extractToken(request: any): string | null {
    // Check Authorization header
    const auth = request.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      return auth.substring(7);
    }

    // Check query parameter
    const url = new URL(request.url, `http://${request.headers.host}`);
    return url.searchParams.get('token');
  }

  /**
   * Get current statistics
   */
  getStats(): {
    clients: number;
    subscriptions: number;
    runSubscriptions: Array<{ runId: string; subscribers: number }>;
  } {
    const runStats = Array.from(this.runSubscriptions.entries()).map(([runId, subscribers]) => ({
      runId,
      subscribers: subscribers.size
    }));

    return {
      clients: this.clients.size,
      subscriptions: runStats.reduce((sum, r) => sum + r.subscribers, 0),
      runSubscriptions: runStats
    };
  }

  /**
   * Get connected clients info
   */
  getClients(): Array<{
    id: string;
    userId?: string;
    subscribedRuns: string[];
    lastActivity: number;
  }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      userId: client.userId,
      subscribedRuns: Array.from(client.subscribedRuns),
      lastActivity: client.lastActivity
    }));
  }
}

// Singleton instance
let wsServer: OrchestrationWebSocketServer | null = null;

export function getWebSocketServer(port?: number): OrchestrationWebSocketServer {
  if (!wsServer) {
    wsServer = new OrchestrationWebSocketServer(port);
  }
  return wsServer;
}

export default OrchestrationWebSocketServer;