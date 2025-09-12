import { NextRequest, NextResponse } from "next/server";
import { getOrchestrationPipeline } from "@/server/orchestrator/pipeline";
import { composeMiddleware, createProjectEditorMiddleware } from '@/server/http/middleware';
import { rateLimiters } from '@/server/security/rateLimit';
import type { AuthenticatedRequest } from '@/server/auth/rbac';

async function handleStartOrchestration(
  request: AuthenticatedRequest,
  { params }: { params: { projectId: string }}
) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = request.user!.id;
    
    const pipeline = getOrchestrationPipeline();
    const { runId } = await pipeline.startOrchestration(params.projectId, {
      resumeFromStage: body.resumeFromStage,
      maxConcurrency: body.maxConcurrency || 3,
      initiatedBy: userId
    });
    
    return NextResponse.json({ 
      runId,
      projectId: params.projectId,
      initiatedBy: { id: userId, email: request.user!.email },
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('Run API error:', error);
    return NextResponse.json(
      { error: 'Failed to start orchestration', message: error.message },
      { status: 500 }
    );
  }
}

async function handleControlOrchestration(
  request: AuthenticatedRequest, 
  { params }: { params: { projectId: string }}
) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const action = searchParams.get('action');
    const userId = request.user!.id;
    
    if (!runId) {
      return NextResponse.json(
        { error: 'runId is required' },
        { status: 400 }
      );
    }
    
    const pipeline = getOrchestrationPipeline();
    let success = false;
    
    switch (action) {
      case 'pause':
        success = pipeline.pauseOrchestration(runId);
        break;
      case 'resume':
        success = pipeline.resumeOrchestration(runId);
        break;
      case 'cancel':
        success = pipeline.cancelOrchestration(runId);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use pause, resume, or cancel' },
          { status: 400 }
        );
    }
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to perform action. Run may not exist.' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      action,
      runId,
      projectId: params.projectId,
      controlledBy: { id: userId, email: request.user!.email },
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('Run control API error:', error);
    return NextResponse.json(
      { error: 'Failed to control orchestration', message: error.message },
      { status: 500 }
    );
  }
}

// Create middleware factory for orchestration routes
function createOrchestrationMiddleware() {
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
  const middlewareCheck = await createOrchestrationMiddleware()(request, context);
  if (middlewareCheck) return middlewareCheck;
  
  return handleStartOrchestration(request as AuthenticatedRequest, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: { projectId: string } }
) {
  const middlewareCheck = await createOrchestrationMiddleware()(request, context);
  if (middlewareCheck) return middlewareCheck;
  
  return handleControlOrchestration(request as AuthenticatedRequest, context);
}