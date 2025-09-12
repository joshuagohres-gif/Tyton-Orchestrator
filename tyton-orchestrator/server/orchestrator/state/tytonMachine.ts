import { createMachine, assign, fromPromise } from "xstate";
import { PrismaClient } from "@prisma/client";
import { OrchestratorContext, saveContext, addLog } from "../context";
import { STAGES, StageId } from "./stageRegistry";
import { topoLayers, runLayer } from "./dag";
import { callLlmWithRetry } from "../llm";
import { openReview, getPendingReview } from "../review";
import { OrchestratorError } from "../errors";

const prisma = new PrismaClient();

export type OrchestratorEvent =
  | { type: "START" }
  | { type: "APPROVE"; stageId: StageId; reviewId: string; notes?: string }
  | { type: "REJECT"; stageId: StageId; reviewId: string; notes?: string }
  | { type: "RETRY"; stageId: StageId }
  | { type: "PAUSE" }
  | { type: "RESUME" };

export interface OrchestratorMachineContext {
  ctx: OrchestratorContext;
  projectId: string;
  orchestratorId: string;
  currentLayer?: number;
  currentStage?: StageId;
  waitingStage?: StageId;
  reviewId?: string;
  lastError?: string;
  retryCount?: number;
}

// Helper function to persist stage run
async function persistStageRun(
  orchestratorId: string,
  stageId: StageId,
  status: string,
  error?: string,
  attempts?: number
) {
  // Try to find existing stage run
  const existingStageRun = await prisma.stageRun.findFirst({
    where: {
      orchestratorId,
      stageId
    }
  });

  const stageRunData = {
    status,
    ...(error && { errorMessage: error }),
    attempts: attempts || 0,
    finishedAt: status === "done" || status === "error" ? new Date() : undefined
  };

  if (existingStageRun) {
    // Update existing stage run
    await prisma.stageRun.update({
      where: { id: existingStageRun.id },
      data: stageRunData
    });
  } else {
    // Create new stage run
    await prisma.stageRun.create({
      data: {
        orchestratorId,
        stageId,
        startedAt: new Date(),
        ...stageRunData
      }
    });
  }
}

// Pipeline runner implementation
const runPipeline = fromPromise(async ({ input }: { input: OrchestratorMachineContext }) => {
  const { ctx, orchestratorId } = input;
  let currentCtx = ctx;

  try {
    const layers = topoLayers();
    console.log(`[ORCHESTRATOR] Starting pipeline with ${layers.length} layers`);

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const layer = layers[layerIndex];
      console.log(`[ORCHESTRATOR] Processing layer ${layerIndex + 1}: [${layer.join(", ")}]`);

      const layerResult = await runLayer(
        layer, 
        async (stageId) => {
        const stage = STAGES[stageId];
        
        // Mark stage as running
        await persistStageRun(orchestratorId, stageId, "running");

        // Check if stage needs review (before running)
        if (stage.needsReview) {
          console.log(`[ORCHESTRATOR] Stage ${stageId} requires review, opening review gate`);
          
          // Run stage to get review payload
          const result = await stage.run(currentCtx);
          
          if (result.reviewPayload) {
            const review = await openReview(orchestratorId, stageId, result.reviewPayload);
            
            // Mark stage as waiting for review
            await persistStageRun(orchestratorId, stageId, "waiting_review");
            
            // Throw special error to signal waiting for review
            throw new OrchestratorError(
              `Stage ${stageId} requires human review`,
              "WAITING_FOR_REVIEW",
              false,
              { stageId, reviewId: review.id }
            );
          }
        }

        // Run the stage
        await runSingleStage(input, stageId);
      },
      undefined, // Use environment concurrency
      (stageId) => {
        console.log(`[ORCHESTRATOR] Stage ${stageId} started`);
      },
      (stageId, duration) => {
        console.log(`[ORCHESTRATOR] Stage ${stageId} completed in ${duration}ms`);
      },
      (stageId, error, duration) => {
        console.error(`[ORCHESTRATOR] Stage ${stageId} failed after ${duration}ms:`, error);
      }
    );

    // Log layer performance
    const speedup = layerResult.totalDuration > 0 ? 
      layerResult.totalDuration / layerResult.maxConcurrentDuration : 1;
    
    console.log(`[ORCHESTRATOR] Layer ${layerIndex + 1} speedup: ${speedup.toFixed(2)}x`);
  }

  console.log("[ORCHESTRATOR] Pipeline completed successfully");
  return { success: true, ctx: currentCtx };

  } catch (error: any) {
    console.error("[ORCHESTRATOR] Pipeline failed:", error);
    
    if (error instanceof OrchestratorError && error.code === "WAITING_FOR_REVIEW") {
      // This is expected for review gates
      throw error;
    }
    
    throw new OrchestratorError(
      `Pipeline execution failed: ${error.message}`,
      "PIPELINE_FAILED",
      true,
      { originalError: error }
    );
  }
});

// Single stage runner
async function runSingleStage(
  machineCtx: OrchestratorMachineContext,
  stageId: StageId
): Promise<void> {
  const { orchestratorId } = machineCtx;
  let { ctx } = machineCtx;
  const stage = STAGES[stageId];

  try {
    console.log(`[ORCHESTRATOR] Running stage: ${stageId}`);

    // Run stage with retry wrapper
    const result = await callLlmWithRetry(
      () => stage.run(ctx),
      {
        maxAttempts: 3,
        onAttempt: (attempt, error) => {
          console.log(`[ORCHESTRATOR] Stage ${stageId} attempt ${attempt + 1}${error ? ` (error: ${error.message})` : ""}`);
        }
      }
    );

    // Update context
    ctx = result.updatedCtx;
    ctx = addLog(ctx, "info", `Stage ${stageId} completed successfully`);

    // Optional validation step
    if (stage.validate) {
      console.log(`[ORCHESTRATOR] Validating stage ${stageId} output`);
      const validation = await stage.validate(ctx);
      
      if (!validation.ok) {
        console.warn(`[ORCHESTRATOR] Stage ${stageId} validation failed:`, validation.errors);
        
        // Try auto-repair if available
        if (stage.autoRepair) {
          console.log(`[ORCHESTRATOR] Attempting auto-repair for stage ${stageId}`);
          ctx = await stage.autoRepair(ctx);
          
          // Re-validate after repair
          const revalidation = await stage.validate(ctx);
          if (!revalidation.ok) {
            throw new OrchestratorError(
              `Stage ${stageId} validation failed after auto-repair: ${revalidation.errors?.join(", ")}`,
              "VALIDATION_FAILED",
              false,
              { stageId, errors: revalidation.errors }
            );
          }
          
          ctx = addLog(ctx, "info", `Stage ${stageId} auto-repaired and validated`);
        } else {
          throw new OrchestratorError(
            `Stage ${stageId} validation failed: ${validation.errors?.join(", ")}`,
            "VALIDATION_FAILED",
            false,
            { stageId, errors: validation.errors }
          );
        }
      }
    }

    // Save updated context
    await saveContext(orchestratorId, ctx);
    
    // Update machine context
    machineCtx.ctx = ctx;

    // Mark stage as completed
    await persistStageRun(orchestratorId, stageId, "done");

    console.log(`[ORCHESTRATOR] Stage ${stageId} completed and validated`);

  } catch (error: any) {
    console.error(`[ORCHESTRATOR] Stage ${stageId} failed:`, error);
    
    // Add error log to context
    ctx = addLog(ctx, "error", `Stage ${stageId} failed: ${error.message}`, { error });
    await saveContext(orchestratorId, ctx);
    
    // Mark stage as errored
    await persistStageRun(orchestratorId, stageId, "error", error.message);
    
    throw error;
  }
}

export const tytonMachine = createMachine({
  id: "tyton-orchestrator",
  types: {
    context: {} as OrchestratorMachineContext,
    events: {} as OrchestratorEvent,
  },
  initial: "idle",
  context: ({ input }: { input: OrchestratorMachineContext }) => input,
  states: {
    idle: {
      on: {
        START: {
          target: "running"
        }
      }
    },
    
    running: {
      invoke: {
        id: "runPipeline",
        src: runPipeline,
        input: ({ context }) => context,
        onDone: {
          target: "done",
          actions: assign(({ event }) => ({
            ctx: event.output.ctx
          }))
        },
        onError: [
          {
            guard: ({ event }) => {
              const error = event.error as OrchestratorError;
              return error?.code === "WAITING_FOR_REVIEW";
            },
            target: "waiting_review",
            actions: assign(({ event }) => {
              const error = event.error as OrchestratorError;
              return {
                waitingStage: error.details?.stageId,
                reviewId: error.details?.reviewId,
                lastError: error.message
              };
            })
          },
          {
            target: "error",
            actions: assign(({ event }) => ({
              lastError: event.error?.message || "Unknown error"
            }))
          }
        ]
      },
      on: {
        PAUSE: {
          target: "paused"
        },
        RETRY: {
          target: "running",
          actions: assign(({ event }) => ({
            retryCount: (context) => (context.retryCount || 0) + 1
          }))
        }
      }
    },

    waiting_review: {
      entry: async ({ context }) => {
        // Update orchestrator run status
        await prisma.orchestratorRun.update({
          where: { id: context.orchestratorId },
          data: { status: "waiting_review" }
        });
      },
      on: {
        APPROVE: {
          target: "running",
          actions: [
            async ({ event, context }) => {
              // Update review status
              await prisma.reviewGate.update({
                where: { id: event.reviewId },
                data: { 
                  status: "approved",
                  notes: event.notes 
                }
              });
              
              // Update stage status
              if (context.waitingStage) {
                await persistStageRun(context.orchestratorId, context.waitingStage, "done");
              }
            },
            assign({
              waitingStage: undefined,
              reviewId: undefined,
              lastError: undefined
            })
          ]
        },
        REJECT: {
          target: "error",
          actions: [
            async ({ event, context }) => {
              // Update review status
              await prisma.reviewGate.update({
                where: { id: event.reviewId },
                data: { 
                  status: "rejected",
                  notes: event.notes 
                }
              });
              
              // Update stage status
              if (context.waitingStage) {
                await persistStageRun(context.orchestratorId, context.waitingStage, "error", "Review rejected");
              }
            },
            assign({
              lastError: ({ event }) => `Review rejected for stage ${event.stageId}: ${event.notes || "No reason provided"}`
            })
          ]
        }
      }
    },

    paused: {
      entry: async ({ context }) => {
        await prisma.orchestratorRun.update({
          where: { id: context.orchestratorId },
          data: { status: "paused" }
        });
      },
      on: {
        RESUME: {
          target: "running"
        }
      }
    },

    error: {
      entry: async ({ context }) => {
        await prisma.orchestratorRun.update({
          where: { id: context.orchestratorId },
          data: { status: "error" }
        });
      },
      on: {
        RETRY: {
          target: "running",
          actions: assign({
            lastError: undefined,
            retryCount: ({ context }) => (context.retryCount || 0) + 1
          })
        }
      }
    },

    done: {
      entry: async ({ context }) => {
        await prisma.orchestratorRun.update({
          where: { id: context.orchestratorId },
          data: { status: "done" }
        });
        
        console.log(`[ORCHESTRATOR] Pipeline completed for project ${context.projectId}`);
      }
    }
  }
});

export type TytonMachine = typeof tytonMachine;