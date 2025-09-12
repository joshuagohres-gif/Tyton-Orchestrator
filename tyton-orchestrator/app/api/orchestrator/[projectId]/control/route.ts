import { NextRequest, NextResponse } from 'next/server';
import { getWebSocketServer } from '../../../../../server/realtime/wsServer';
import { z, ZodError } from 'zod';
import { withMiddleware, createProjectEditorMiddleware, composeMiddleware } from '@/server/http/middleware';
import { rateLimiters } from '@/server/security/rateLimit';
import type { AuthenticatedRequest } from '@/server/auth/rbac';

const ControlCommandSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
  reason: z.string().optional()
});

async function handleControlCommand(
  request: AuthenticatedRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const userId = request.user!.id; // Guaranteed by middleware
    
    // Validate request body
    const body = await request.json();
    const { action, reason } = ControlCommandSchema.parse(body);

    // Get WebSocket server instance
    const wsServer = getWebSocketServer();
    
    // Check if there are any subscribers to this run
    const stats = wsServer.getStats();
    const projectSubscription = stats.runSubscriptions.find(r => r.runId === projectId);
    
    if (!projectSubscription || projectSubscription.subscribers === 0) {
      return NextResponse.json(
        { error: 'No active orchestration session found for this project' },
        { status: 404 }
      );
    }

    // Emit control event for external handling
    wsServer.emit('control', {
      clientId: 'api-request',
      userId,
      runId: projectId,
      action,
      reason,
      source: 'api'
    });

    // Broadcast status update to subscribers
    wsServer.broadcastStatus({
      runId: projectId,
      projectId,
      status: action === 'pause' ? 'paused' : 
              action === 'resume' ? 'running' : 
              action === 'cancel' ? 'cancelling' : 'running',
      progress: {
        total: 0, // Will be updated by orchestrator
        completed: 0,
        failed: 0,
        percentage: 0
      },
      message: reason || `${action.charAt(0).toUpperCase() + action.slice(1)} requested via API by ${request.user!.email}`,
      startedAt: Date.now(),
      updatedAt: Date.now()
    });

    return NextResponse.json({
      success: true,
      action,
      projectId,
      subscribersNotified: projectSubscription.subscribers,
      user: { id: userId, email: request.user!.email },
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('Control command error:', error);
    
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleGetControlStatus(
  request: AuthenticatedRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const wsServer = getWebSocketServer();
    const stats = wsServer.getStats();
    
    // Find subscription info for this project
    const projectSubscription = stats.runSubscriptions.find(r => r.runId === projectId);
    
    // Get connected clients for this project
    const clients = wsServer.getClients().filter(c => 
      c.subscribedRuns.includes(projectId)
    );

    return NextResponse.json({
      projectId,
      subscribers: projectSubscription?.subscribers || 0,
      connectedClients: clients.length,
      clients: clients.map(c => ({
        id: c.id,
        userId: c.userId,
        lastActivity: c.lastActivity,
        connectedAt: new Date(c.lastActivity).toISOString()
      })),
      availableActions: ['pause', 'resume', 'cancel'],
      requestedBy: { id: request.user!.id, email: request.user!.email },
      timestamp: Date.now()
    });

  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Create middleware factory that extracts projectId from params
function createControlMiddleware() {
  return async (request: NextRequest, { params }: { params: { projectId: string } }) => {
    const projectId = params.projectId;
    const middleware = composeMiddleware(
      rateLimiters.orchestration.middleware(),
      createProjectEditorMiddleware(projectId)
    );
    return middleware(request);
  };
}

// Export the protected route handlers
export async function POST(
  request: NextRequest,
  context: { params: { projectId: string } }
) {
  const middlewareCheck = await createControlMiddleware()(request, context);
  if (middlewareCheck) return middlewareCheck;
  
  return handleControlCommand(request as AuthenticatedRequest, context);
}

export async function GET(
  request: NextRequest,
  context: { params: { projectId: string } }
) {
  const middlewareCheck = await createControlMiddleware()(request, context);
  if (middlewareCheck) return middlewareCheck;
  
  return handleGetControlStatus(request as AuthenticatedRequest, context);
}