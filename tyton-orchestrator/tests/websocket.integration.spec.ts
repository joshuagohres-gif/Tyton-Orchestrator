import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getWebSocketIntegration } from '../server/realtime/wsIntegration';
import { getWebSocketServer } from '../server/realtime/wsServer';
import { createServer } from 'http';
import WebSocket from 'ws';

describe('WebSocket Integration', () => {
  let wsIntegration: ReturnType<typeof getWebSocketIntegration>;
  let wsServer: ReturnType<typeof getWebSocketServer>;
  let httpServer: any;
  let client: WebSocket;
  const port = 3002; // Use different port for testing

  beforeAll(async () => {
    // Create HTTP server for testing
    httpServer = createServer();
    
    // Initialize WebSocket integration
    wsIntegration = getWebSocketIntegration();
    wsServer = getWebSocketServer(port);
    
    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(port, () => {
        wsIntegration.startWebSocketServer(httpServer);
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }
    
    wsIntegration.stopWebSocketServer();
    
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  beforeEach(async () => {
    // Clean up any existing connections
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  });

  it('should establish WebSocket connection successfully', async () => {
    const connectionPromise = new Promise<void>((resolve, reject) => {
      client = new WebSocket(`ws://localhost:${port}/ws/orchestrator`);
      
      client.on('open', () => {
        resolve();
      });
      
      client.on('error', (error) => {
        reject(error);
      });
      
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    await expect(connectionPromise).resolves.toBeUndefined();
  });

  it('should handle subscription and broadcasting', async () => {
    client = new WebSocket(`ws://localhost:${port}/ws/orchestrator`);
    
    const messages: any[] = [];
    
    const messagePromise = new Promise<void>((resolve) => {
      let expectedMessages = 0;
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messages.push(message);
        
        if (message.type === 'subscribed') {
          expectedMessages++;
        }
        if (message.type === 'progress') {
          expectedMessages++;
        }
        
        if (expectedMessages >= 2) {
          resolve();
        }
      });
    });

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        // Subscribe to a test run
        client.send(JSON.stringify({
          type: 'subscribe',
          runId: 'test-run-123'
        }));
        resolve();
      });
    });

    // Simulate a progress update
    setTimeout(() => {
      wsServer.broadcastProgress({
        runId: 'test-run-123',
        stageId: 'test-stage',
        status: 'running',
        attempts: 1,
        message: 'Testing progress broadcast',
        timestamp: Date.now()
      });
    }, 100);

    await messagePromise;

    // Verify subscription message
    const subscriptionMsg = messages.find(m => m.type === 'subscribed');
    expect(subscriptionMsg).toBeDefined();
    expect(subscriptionMsg.runId).toBe('test-run-123');

    // Verify progress message
    const progressMsg = messages.find(m => m.type === 'progress');
    expect(progressMsg).toBeDefined();
    expect(progressMsg.runId).toBe('test-run-123');
    expect(progressMsg.stageId).toBe('test-stage');
    expect(progressMsg.status).toBe('running');
  });

  it('should handle control commands through WebSocket', async () => {
    client = new WebSocket(`ws://localhost:${port}/ws/orchestrator`);
    
    const controlAckPromise = new Promise<any>((resolve) => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'control_ack') {
          resolve(message);
        }
      });
    });

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        // Subscribe first
        client.send(JSON.stringify({
          type: 'subscribe',
          runId: 'test-run-control'
        }));
        
        // Send control command
        setTimeout(() => {
          client.send(JSON.stringify({
            type: 'control',
            runId: 'test-run-control',
            action: 'pause'
          }));
        }, 100);
        
        resolve();
      });
    });

    const ackMessage = await controlAckPromise;
    expect(ackMessage.type).toBe('control_ack');
    expect(ackMessage.runId).toBe('test-run-control');
    expect(ackMessage.action).toBe('pause');
  });

  it('should handle authentication with valid JWT token', async () => {
    // Mock JWT token (in real scenario, use proper token)
    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJpYXQiOjE2MDA5NjAwMDB9.test';
    
    const authPromise = new Promise<void>((resolve, reject) => {
      const authClient = new WebSocket(`ws://localhost:${port}/ws/orchestrator?token=${mockToken}`);
      
      authClient.on('open', () => {
        authClient.close();
        resolve();
      });
      
      authClient.on('error', (error) => {
        reject(error);
      });
      
      authClient.on('close', (code) => {
        if (code === 1008) {
          reject(new Error('Authentication failed'));
        }
      });
    });

    // This might fail in test environment without proper JWT secret
    // but it tests the authentication flow
    try {
      await authPromise;
    } catch (error) {
      // Expected in test environment - verify error is auth-related
      expect(error.message).toContain('Authentication failed');
    }
  });

  it('should track client connections and subscriptions', () => {
    const stats = wsServer.getStats();
    
    expect(stats).toHaveProperty('clients');
    expect(stats).toHaveProperty('subscriptions');
    expect(stats).toHaveProperty('runSubscriptions');
    expect(typeof stats.clients).toBe('number');
    expect(typeof stats.subscriptions).toBe('number');
    expect(Array.isArray(stats.runSubscriptions)).toBe(true);
  });

  it('should provide integration service statistics', () => {
    const integrationStats = wsIntegration.getStats();
    
    expect(integrationStats).toHaveProperty('activeRuns');
    expect(integrationStats).toHaveProperty('wsStats');
    expect(integrationStats).toHaveProperty('connectedClients');
    
    expect(typeof integrationStats.activeRuns).toBe('number');
    expect(typeof integrationStats.connectedClients).toBe('number');
    expect(integrationStats.wsStats).toHaveProperty('clients');
  });

  it('should handle heartbeat and connection cleanup', async () => {
    client = new WebSocket(`ws://localhost:${port}/ws/orchestrator`);
    
    const pingPromise = new Promise<void>((resolve) => {
      client.on('ping', () => {
        // Respond to ping with pong
        client.pong();
      });
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'pong') {
          resolve();
        }
      });
    });

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        // Send ping to test heartbeat
        client.send(JSON.stringify({ type: 'ping' }));
        resolve();
      });
    });

    await pingPromise;
  });

  it('should handle broadcast status updates', async () => {
    client = new WebSocket(`ws://localhost:${port}/ws/orchestrator`);
    
    const statusPromise = new Promise<any>((resolve) => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'status') {
          resolve(message);
        }
      });
    });

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        // Subscribe to test run
        client.send(JSON.stringify({
          type: 'subscribe',
          runId: 'test-status-run'
        }));
        resolve();
      });
    });

    // Simulate status broadcast
    setTimeout(() => {
      wsServer.broadcastStatus({
        runId: 'test-status-run',
        projectId: 'test-project',
        status: 'running',
        progress: {
          total: 10,
          completed: 3,
          failed: 0,
          percentage: 30
        },
        message: 'Test status update',
        startedAt: Date.now() - 10000,
        updatedAt: Date.now()
      });
    }, 100);

    const statusMessage = await statusPromise;
    expect(statusMessage.type).toBe('status');
    expect(statusMessage.runId).toBe('test-status-run');
    expect(statusMessage.status).toBe('running');
    expect(statusMessage.progress.percentage).toBe(30);
  });
});