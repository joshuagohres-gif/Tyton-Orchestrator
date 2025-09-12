import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { createActor } from "xstate";
import { tytonMachine } from "@/server/orchestrator/state/tytonMachine";
import { initContext } from "@/server/orchestrator/context";
import { validateStageGraph } from "@/server/orchestrator/state/dag";

const prisma = new PrismaClient();

// Store active machine actors
const activeMachines = new Map<string, any>();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await request.json();
    const { userBrief } = body;

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Validate stage dependency graph
    const graphValidation = validateStageGraph();
    if (!graphValidation.valid) {
      return NextResponse.json(
        { 
          error: "Invalid stage dependency graph", 
          details: graphValidation.errors 
        },
        { status: 400 }
      );
    }

    // Check if orchestrator is already running for this project
    const existingRun = await prisma.orchestratorRun.findFirst({
      where: {
        projectId,
        status: { in: ["running", "waiting_review", "paused"] }
      }
    });

    if (existingRun) {
      return NextResponse.json(
        { 
          error: "Orchestrator already running for this project",
          orchestratorId: existingRun.id,
          status: existingRun.status
        },
        { status: 409 }
      );
    }

    // Initialize context
    const initialCtx = await initContext(projectId, userBrief);

    // Create orchestrator run record
    const orchestratorRun = await prisma.orchestratorRun.create({
      data: {
        projectId,
        status: "idle",
        contextJson: JSON.stringify(initialCtx)
      }
    });

    // Create and start machine actor
    const machineContext = {
      ctx: initialCtx,
      projectId,
      orchestratorId: orchestratorRun.id
    };

    const actor = createActor(tytonMachine, {
      input: machineContext
    });

    // Store actor for later reference
    activeMachines.set(orchestratorRun.id, actor);

    // Start the actor
    actor.start();

    // Send START event to begin pipeline
    actor.send({ type: "START" });

    // Update status to running
    await prisma.orchestratorRun.update({
      where: { id: orchestratorRun.id },
      data: { status: "running" }
    });

    return NextResponse.json({
      orchestratorId: orchestratorRun.id,
      status: "running",
      message: "Orchestrator started successfully"
    });

  } catch (error: any) {
    console.error("Failed to start orchestrator:", error);
    return NextResponse.json(
      { error: "Failed to start orchestrator", details: error.message },
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

    // Get current orchestrator run for project
    const run = await prisma.orchestratorRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        stageRuns: {
          orderBy: { startedAt: "asc" }
        },
        reviewGates: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!run) {
      return NextResponse.json({
        status: "idle",
        message: "No orchestrator run found for this project"
      });
    }

    return NextResponse.json({
      orchestratorId: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      stages: run.stageRuns.map(stage => ({
        stageId: stage.stageId,
        status: stage.status,
        attempts: stage.attempts,
        errorMessage: stage.errorMessage,
        startedAt: stage.startedAt,
        finishedAt: stage.finishedAt
      })),
      pendingReview: run.reviewGates.find(r => r.status === "open") || null
    });

  } catch (error: any) {
    console.error("Failed to get orchestrator status:", error);
    return NextResponse.json(
      { error: "Failed to get orchestrator status", details: error.message },
      { status: 500 }
    );
  }
}