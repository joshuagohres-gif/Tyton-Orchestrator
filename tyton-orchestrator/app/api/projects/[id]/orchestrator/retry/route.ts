import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

// Store active machine actors (shared with other routes)
const activeMachines = new Map<string, any>();

const RetryRequestSchema = z.object({
  stageId: z.string().optional(), // If not provided, retry entire pipeline
  reason: z.string().optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await request.json();
    
    // Validate request body
    const validation = RetryRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.errors },
        { status: 400 }
      );
    }

    const { stageId, reason } = validation.data;

    // Get current orchestrator run
    const run = await prisma.orchestratorRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" }
    });

    if (!run) {
      return NextResponse.json(
        { error: "No orchestrator run found for this project" },
        { status: 404 }
      );
    }

    // Check if retry is allowed for current status
    if (!["error", "paused"].includes(run.status)) {
      return NextResponse.json(
        { 
          error: `Cannot retry from status "${run.status}". Only error or paused orchestrators can be retried.`,
          currentStatus: run.status
        },
        { status: 409 }
      );
    }

    // If specific stage provided, reset that stage
    if (stageId) {
      await prisma.stageRun.updateMany({
        where: {
          orchestratorId: run.id,
          stageId
        },
        data: {
          status: "pending",
          errorMessage: null,
          errorCode: null,
          attempts: 0,
          startedAt: null,
          finishedAt: null
        }
      });
    } else {
      // Reset all failed stages
      await prisma.stageRun.updateMany({
        where: {
          orchestratorId: run.id,
          status: "error"
        },
        data: {
          status: "pending",
          errorMessage: null,
          errorCode: null,
          startedAt: null,
          finishedAt: null
        }
      });
    }

    // Get the machine actor for this orchestrator
    const actor = activeMachines.get(run.id);
    if (!actor) {
      return NextResponse.json(
        { error: "Orchestrator machine not found - may need to restart from beginning" },
        { status: 404 }
      );
    }

    // Send RETRY event to machine
    actor.send({
      type: "RETRY",
      stageId: stageId || "all"
    });

    // Update orchestrator status
    await prisma.orchestratorRun.update({
      where: { id: run.id },
      data: { 
        status: "running",
        updatedAt: new Date()
      }
    });

    return NextResponse.json({
      success: true,
      orchestratorId: run.id,
      retryScope: stageId || "all_failed_stages",
      reason: reason || "Manual retry",
      message: `Retry initiated for ${stageId || "failed stages"}`
    });

  } catch (error: any) {
    console.error("Failed to retry orchestrator:", error);
    return NextResponse.json(
      { error: "Failed to retry orchestrator", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Get current orchestrator run with failed stages
    const run = await prisma.orchestratorRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        stageRuns: {
          where: { status: "error" },
          orderBy: { startedAt: "asc" }
        }
      }
    });

    if (!run) {
      return NextResponse.json({
        canRetry: false,
        message: "No orchestrator run found"
      });
    }

    const canRetry = ["error", "paused"].includes(run.status);
    const failedStages = run.stageRuns.map(stage => ({
      stageId: stage.stageId,
      attempts: stage.attempts,
      errorMessage: stage.errorMessage,
      errorCode: stage.errorCode,
      startedAt: stage.startedAt,
      finishedAt: stage.finishedAt
    }));

    return NextResponse.json({
      canRetry,
      orchestratorId: run.id,
      currentStatus: run.status,
      failedStages,
      retryOptions: canRetry ? [
        {
          scope: "all",
          description: "Retry all failed stages",
          stageCount: failedStages.length
        },
        ...failedStages.map(stage => ({
          scope: "single",
          stageId: stage.stageId,
          description: `Retry ${stage.stageId} only`,
          lastError: stage.errorMessage
        }))
      ] : [],
      message: canRetry 
        ? `${failedStages.length} stages available for retry`
        : `Cannot retry from status "${run.status}"`
    });

  } catch (error: any) {
    console.error("Failed to get retry options:", error);
    return NextResponse.json(
      { error: "Failed to get retry options", details: error.message },
      { status: 500 }
    );
  }
}