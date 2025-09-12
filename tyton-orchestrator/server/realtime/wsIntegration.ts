import { getWebSocketServer, OrchestrationStatus, ProgressUpdate } from './wsServer';
import { pipelineBus } from '../orchestrator/pipeline';
import { EventEmitter } from 'events';

interface PipelineStageEvent {
  runId: string;
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  attempts: number;
  message?: string;
  duration?: number;
}

interface OrchestrationRunStatus {
  runId: string;
  projectId: string;
  status: 'starting' | 'running' | 'paused' | 'cancelling' | 'done' | 'error';
  totalStages: number;
  completedStages: number;
  failedStages: number;
  currentStage?: string;
  message?: string;
  startedAt: number;
  estimatedCompletion?: number;
}

class WebSocketIntegration extends EventEmitter {
  private wsServer = getWebSocketServer();
  private activeRuns = new Map<string, OrchestrationRunStatus>();
  private stageTimings = new Map<string, number>(); // stageId -> avgDuration

  constructor() {
    super();
    this.setupEventListeners();
    this.loadHistoricalTimings();
  }

  private async loadHistoricalTimings() {
    // Load average stage durations from database for better ETA estimates
    try {
      const { prisma } = await import('../db/client');
      const stageStats = await prisma.stageRun.groupBy({
        by: ['stageId'],
        _avg: {
          duration: true
        },
        where: {
          status: 'done',
          duration: { not: null }
        }
      });

      stageStats.forEach(stat => {
        if (stat._avg.duration) {
          this.stageTimings.set(stat.stageId, stat._avg.duration);
        }
      });

      console.log(`📊 Loaded timing data for ${stageStats.length} stages`);
    } catch (error) {
      console.warn('Failed to load historical stage timings:', error);
    }
  }

  private setupEventListeners() {
    // Listen to pipeline stage events
    pipelineBus.on('stage', (event: PipelineStageEvent) => {
      this.handleStageEvent(event);
    });

    // Listen to orchestration run status changes
    pipelineBus.on('orchestration:start', (data: { runId: string; projectId: string; totalStages: number }) => {
      this.handleOrchestrationStart(data);
    });

    pipelineBus.on('orchestration:complete', (data: { runId: string; success: boolean; message?: string }) => {
      this.handleOrchestrationComplete(data);
    });

    pipelineBus.on('orchestration:error', (data: { runId: string; error: string; stage?: string }) => {
      this.handleOrchestrationError(data);
    });

    // Listen to control commands from WebSocket
    this.wsServer.on('control', (data: { clientId: string; userId?: string; runId: string; action: string }) => {
      this.handleControlCommand(data);
    });

    // Listen to WebSocket connection events
    this.wsServer.on('subscription', (data: { clientId: string; runId: string; action: 'subscribe' | 'unsubscribe' }) => {
      console.log(`🔌 Client ${data.clientId} ${data.action}d to run ${data.runId}`);
    });

    this.wsServer.on('disconnect', (data: { clientId: string; userId?: string }) => {
      console.log(`👋 Client disconnected: ${data.clientId} (user: ${data.userId || 'anonymous'})`);
    });
  }

  private handleStageEvent(event: PipelineStageEvent) {
    const { runId, id: stageId, status, attempts, message, duration } = event;
    
    // Update active run tracking
    const run = this.activeRuns.get(runId);
    if (run) {
      if (status === 'completed') {
        run.completedStages++;
      } else if (status === 'failed') {
        run.failedStages++;
      }

      if (status === 'running') {
        run.currentStage = stageId;
      }

      // Update progress percentage
      const progress = Math.round((run.completedStages / run.totalStages) * 100);
      
      // Estimate completion time based on historical data
      let estimatedCompletion: number | undefined;
      if (run.currentStage && this.stageTimings.has(run.currentStage)) {
        const avgDuration = this.stageTimings.get(run.currentStage)!;
        const remainingStages = run.totalStages - run.completedStages - 1;
        const avgRemainingTime = remainingStages * 30000; // 30s average fallback
        estimatedCompletion = Date.now() + avgDuration + avgRemainingTime;
      }

      run.estimatedCompletion = estimatedCompletion;
    }

    // Create progress update for WebSocket broadcast
    const progressUpdate: ProgressUpdate = {
      runId,
      stageId,
      status,
      attempts,
      message,
      progress: duration ? undefined : (run ? Math.round((run.completedStages / run.totalStages) * 100) : undefined),
      duration,
      timestamp: Date.now()
    };

    // Broadcast to WebSocket subscribers
    this.wsServer.broadcastProgress(progressUpdate);

    console.log(`📡 Stage ${stageId} (${runId}): ${status} ${message ? `- ${message}` : ''}`);
  }

  private handleOrchestrationStart(data: { runId: string; projectId: string; totalStages: number }) {
    const { runId, projectId, totalStages } = data;
    
    const runStatus: OrchestrationRunStatus = {
      runId,
      projectId,
      status: 'starting',
      totalStages,
      completedStages: 0,
      failedStages: 0,
      message: 'Orchestration starting...',
      startedAt: Date.now()
    };

    this.activeRuns.set(runId, runStatus);

    // Broadcast status update
    this.wsServer.broadcastStatus({
      runId,
      projectId,
      status: 'starting',
      progress: {
        total: totalStages,
        completed: 0,
        failed: 0,
        percentage: 0
      },
      message: 'Orchestration starting...',
      startedAt: Date.now(),
      updatedAt: Date.now()
    });

    console.log(`🚀 Orchestration started: ${runId} (${totalStages} stages)`);
  }

  private handleOrchestrationComplete(data: { runId: string; success: boolean; message?: string }) {
    const { runId, success, message } = data;
    const run = this.activeRuns.get(runId);
    
    if (run) {
      run.status = success ? 'done' : 'error';
      run.message = message || (success ? 'Orchestration completed successfully' : 'Orchestration failed');

      // Broadcast final status
      this.wsServer.broadcastStatus({
        runId,
        projectId: run.projectId,
        status: run.status,
        progress: {
          total: run.totalStages,
          completed: run.completedStages,
          failed: run.failedStages,
          percentage: success ? 100 : Math.round((run.completedStages / run.totalStages) * 100)
        },
        message: run.message,
        startedAt: run.startedAt,
        updatedAt: Date.now()
      });

      // Clean up after a delay
      setTimeout(() => {
        this.activeRuns.delete(runId);
      }, 60000); // Keep for 1 minute after completion
    }

    console.log(`🏁 Orchestration ${success ? 'completed' : 'failed'}: ${runId}`);
  }

  private handleOrchestrationError(data: { runId: string; error: string; stage?: string }) {
    const { runId, error, stage } = data;
    const run = this.activeRuns.get(runId);
    
    if (run) {
      run.status = 'error';
      run.message = `Error${stage ? ` in ${stage}` : ''}: ${error}`;

      this.wsServer.broadcastStatus({
        runId,
        projectId: run.projectId,
        status: 'error',
        progress: {
          total: run.totalStages,
          completed: run.completedStages,
          failed: run.failedStages + 1,
          percentage: Math.round((run.completedStages / run.totalStages) * 100)
        },
        currentStage: stage,
        message: run.message,
        startedAt: run.startedAt,
        updatedAt: Date.now()
      });
    }

    console.error(`❌ Orchestration error: ${runId} - ${error}`);
  }

  private async handleControlCommand(data: { clientId: string; userId?: string; runId: string; action: string }) {
    const { runId, action, userId } = data;
    
    console.log(`🎮 Control command: ${action} for run ${runId} from user ${userId || 'anonymous'}`);

    // Forward to pipeline bus for orchestrator to handle
    pipelineBus.emit('control', {
      runId,
      action,
      userId,
      timestamp: Date.now()
    });

    // Update local run status
    const run = this.activeRuns.get(runId);
    if (run) {
      switch (action) {
        case 'pause':
          run.status = 'paused';
          run.message = 'Orchestration paused by user';
          break;
        case 'resume':
          run.status = 'running';
          run.message = 'Orchestration resumed';
          break;
        case 'cancel':
          run.status = 'cancelling';
          run.message = 'Orchestration cancelled by user';
          break;
      }

      // Broadcast updated status
      this.wsServer.broadcastStatus({
        runId,
        projectId: run.projectId,
        status: run.status,
        progress: {
          total: run.totalStages,
          completed: run.completedStages,
          failed: run.failedStages,
          percentage: Math.round((run.completedStages / run.totalStages) * 100)
        },
        currentStage: run.currentStage,
        message: run.message,
        startedAt: run.startedAt,
        updatedAt: Date.now()
      });
    }
  }

  public getActiveRuns(): OrchestrationRunStatus[] {
    return Array.from(this.activeRuns.values());
  }

  public getRunStatus(runId: string): OrchestrationRunStatus | undefined {
    return this.activeRuns.get(runId);
  }

  public startWebSocketServer(server?: any): void {
    this.wsServer.start(server);
    console.log('🔌 WebSocket integration service started');
  }

  public stopWebSocketServer(): void {
    this.wsServer.stop();
    console.log('🔌 WebSocket integration service stopped');
  }

  public getStats() {
    return {
      activeRuns: this.activeRuns.size,
      wsStats: this.wsServer.getStats(),
      connectedClients: this.wsServer.getClients().length
    };
  }
}

// Singleton instance
let wsIntegration: WebSocketIntegration | null = null;

export function getWebSocketIntegration(): WebSocketIntegration {
  if (!wsIntegration) {
    wsIntegration = new WebSocketIntegration();
  }
  return wsIntegration;
}

export default WebSocketIntegration;