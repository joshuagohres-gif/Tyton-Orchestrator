import { NextResponse } from "next/server";
import { getOrchestrationPipeline } from "@/server/orchestrator/pipeline";

export async function GET(
  request: Request, 
  { params }: { params: { projectId: string }}
) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    
    const pipeline = getOrchestrationPipeline();
    const status = pipeline.snapshotStatus(params.projectId, runId || undefined);
    
    return NextResponse.json(status);
  } catch (error: any) {
    console.error('Status API error:', error);
    return NextResponse.json(
      { error: 'Failed to get orchestration status', message: error.message },
      { status: 500 }
    );
  }
}