import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { STAGES } from "@/server/orchestrator/state/stageRegistry";
import { topoLayers } from "@/server/orchestrator/state/dag";
import { parseReviewPayload } from "@/server/orchestrator/review";

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Get current orchestrator run for project
    const run = await prisma.orchestratorRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        stageRuns: {
          orderBy: { startedAt: "asc" }
        },
        reviewGates: {
          where: { status: "open" },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!run) {
      return NextResponse.json({
        status: "idle",
        message: "No orchestrator run found for this project",
        stages: [],
        layers: [],
        pendingReview: null,
        logs: []
      });
    }

    // Parse context to get logs
    let logs: any[] = [];
    try {
      const context = JSON.parse(run.contextJson);
      logs = context.logs || [];
    } catch (e) {
      console.warn("Failed to parse orchestrator context for logs");
    }

    // Get DAG layers for visualization
    const layers = topoLayers();

    // Enhance stage runs with stage metadata
    const enhancedStages = run.stageRuns.map(stageRun => {
      const stageDef = STAGES[stageRun.stageId as keyof typeof STAGES];
      return {
        stageId: stageRun.stageId,
        name: stageDef?.name || stageRun.stageId,
        description: stageDef?.description || "",
        status: stageRun.status,
        attempts: stageRun.attempts,
        errorCode: stageRun.errorCode,
        errorMessage: stageRun.errorMessage,
        startedAt: stageRun.startedAt,
        finishedAt: stageRun.finishedAt,
        needsReview: stageDef?.needsReview || false,
        dependencies: stageDef?.deps || []
      };
    });

    // Get pending review with parsed payload
    const pendingReview = run.reviewGates[0] ? {
      id: run.reviewGates[0].id,
      stageId: run.reviewGates[0].stageId,
      status: run.reviewGates[0].status,
      payload: parseReviewPayload(run.reviewGates[0].payloadJson),
      createdAt: run.reviewGates[0].createdAt
    } : null;

    // Calculate progress stats
    const totalStages = Object.keys(STAGES).length;
    const completedStages = enhancedStages.filter(s => s.status === "done").length;
    const failedStages = enhancedStages.filter(s => s.status === "error").length;
    const runningStages = enhancedStages.filter(s => s.status === "running").length;

    return NextResponse.json({
      orchestratorId: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      progress: {
        total: totalStages,
        completed: completedStages,
        failed: failedStages,
        running: runningStages,
        percentage: Math.round((completedStages / totalStages) * 100)
      },
      stages: enhancedStages,
      layers: layers.map((layer, index) => ({
        index,
        stages: layer,
        completed: layer.every(stageId => 
          enhancedStages.find(s => s.stageId === stageId)?.status === "done"
        ),
        running: layer.some(stageId => 
          enhancedStages.find(s => s.stageId === stageId)?.status === "running"
        )
      })),
      pendingReview,
      logs: logs.slice(-50), // Last 50 log entries
      message: getStatusMessage(run.status, pendingReview, completedStages, totalStages)
    });

  } catch (error: any) {
    console.error("Failed to get orchestrator status:", error);
    return NextResponse.json(
      { error: "Failed to get orchestrator status", details: error.message },
      { status: 500 }
    );
  }
}

function getStatusMessage(
  status: string, 
  pendingReview: any, 
  completed: number, 
  total: number
): string {
  switch (status) {
    case "idle":
      return "Orchestrator is ready to start";
    case "running":
      return `Processing pipeline (${completed}/${total} stages completed)`;
    case "waiting_review":
      return `Waiting for human review: ${pendingReview?.stageId || "unknown stage"}`;
    case "paused":
      return "Pipeline execution is paused";
    case "error":
      return "Pipeline execution failed";
    case "done":
      return "Pipeline execution completed successfully";
    default:
      return `Status: ${status}`;
  }
}