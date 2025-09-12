import { NextRequest } from 'next/server';
import { getWebSocketIntegration } from '@/server/realtime/wsIntegration';

export const runtime = 'nodejs';

/**
 * Get WebSocket integration status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const wsIntegration = getWebSocketIntegration();
    const stats = wsIntegration.getStats();
    const activeRuns = wsIntegration.getActiveRuns();

    return Response.json({
      status: 'active',
      timestamp: Date.now(),
      stats,
      activeRuns: activeRuns.map(run => ({
        runId: run.runId,
        projectId: run.projectId,
        status: run.status,
        progress: {
          total: run.totalStages,
          completed: run.completedStages,
          failed: run.failedStages,
          percentage: Math.round((run.completedStages / run.totalStages) * 100)
        },
        currentStage: run.currentStage,
        startedAt: run.startedAt,
        estimatedCompletion: run.estimatedCompletion
      }))
    });
  } catch (error) {
    console.error('Failed to get WebSocket status:', error);
    
    return Response.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}