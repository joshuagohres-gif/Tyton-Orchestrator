import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActor } from "xstate";
import { tytonMachine } from "@/server/orchestrator/state/tytonMachine";
import { OrchestratorContext } from "@/server/orchestrator/context";

// Mock external dependencies
vi.mock("@/server/orchestrator/state/stageRegistry", () => ({
  STAGES: {
    "review:project": {
      id: "review:project",
      name: "Project Review",
      description: "Test review stage",
      needsReview: true,
      deps: [],
      run: vi.fn(async (ctx) => ({
        updatedCtx: ctx,
        reviewPayload: { summary: "Test review payload" }
      }))
    },
    "simple:stage": {
      id: "simple:stage",
      name: "Simple Stage",
      description: "Test simple stage",
      deps: ["review:project"],
      run: vi.fn(async (ctx) => ({
        updatedCtx: {
          ...ctx,
          logs: [...ctx.logs, {
            t: new Date().toISOString(),
            level: "info" as const,
            msg: "Simple stage completed"
          }]
        }
      }))
    }
  }
}));

vi.mock("@/server/orchestrator/state/dag", () => ({
  topoLayers: vi.fn(() => [
    ["review:project"],
    ["simple:stage"]
  ]),
  runLayer: vi.fn(async (layer, runStage) => {
    for (const stageId of layer) {
      await runStage(stageId);
    }
  })
}));

vi.mock("@/server/orchestrator/review", () => ({
  openReview: vi.fn(async () => ({ id: "test-review-id" }))
}));

vi.mock("@/server/orchestrator/context", () => ({
  saveContext: vi.fn(async () => {}),
  addLog: vi.fn((ctx, level, msg) => ({
    ...ctx,
    logs: [...ctx.logs, { t: new Date().toISOString(), level, msg }]
  }))
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    stageRun: {
      upsert: vi.fn(),
      updateMany: vi.fn()
    },
    orchestratorRun: {
      update: vi.fn()
    },
    reviewGate: {
      update: vi.fn()
    }
  }))
}));

describe("Tyton Orchestrator Machine", () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      ctx: {
        version: "2",
        project: { id: "test-project", title: "Test Project" },
        inputs: { userBrief: "Test brief" },
        analysis: { viability: null, safetyFlags: [] },
        selection: { components: [], pinMap: null },
        schematic: { specV12: null, erc: null },
        eda: { specV1: null, drc: null },
        wiring: { md: null, edges: [] },
        bom: { items: [], sourcing: [] },
        logs: []
      } as OrchestratorContext,
      projectId: "test-project",
      orchestratorId: "test-orchestrator"
    };

    vi.clearAllMocks();
  });

  it("should start in idle state", () => {
    const actor = createActor(tytonMachine, { input: mockContext });
    actor.start();

    expect(actor.getSnapshot().value).toBe("idle");
  });

  it("should transition to running on START event", () => {
    const actor = createActor(tytonMachine, { input: mockContext });
    actor.start();

    actor.send({ type: "START" });

    expect(actor.getSnapshot().value).toBe("running");
  });

  it("should transition to waiting_review when stage requires review", async () => {
    const actor = createActor(tytonMachine, { input: mockContext });
    actor.start();

    // Start the machine
    actor.send({ type: "START" });

    // Wait for the machine to process and reach waiting_review state
    await new Promise(resolve => {
      const subscription = actor.subscribe(state => {
        if (state.value === "waiting_review") {
          subscription.unsubscribe();
          resolve(state);
        }
      });
    });

    const finalState = actor.getSnapshot();
    expect(finalState.value).toBe("waiting_review");
    expect(finalState.context.waitingStage).toBe("review:project");
    expect(finalState.context.reviewId).toBe("test-review-id");
  });

  it("should resume execution on APPROVE event", async () => {
    const actor = createActor(tytonMachine, { input: mockContext });
    actor.start();

    // Start the machine and wait for review
    actor.send({ type: "START" });

    await new Promise(resolve => {
      const subscription = actor.subscribe(state => {
        if (state.value === "waiting_review") {
          subscription.unsubscribe();
          resolve(state);
        }
      });
    });

    // Approve the review
    actor.send({
      type: "APPROVE",
      stageId: "review:project",
      reviewId: "test-review-id",
      notes: "Approved for testing"
    });

    // Wait for completion or next state
    await new Promise(resolve => setTimeout(resolve, 100));

    const finalState = actor.getSnapshot();
    expect(finalState.value).toBeOneOf(["running", "done"]);
    expect(finalState.context.waitingStage).toBeUndefined();
    expect(finalState.context.reviewId).toBeUndefined();
  });

  it("should transition to error on REJECT event", async () => {
    const actor = createActor(tytonMachine, { input: mockContext });
    actor.start();

    // Start the machine and wait for review
    actor.send({ type: "START" });

    await new Promise(resolve => {
      const subscription = actor.subscribe(state => {
        if (state.value === "waiting_review") {
          subscription.unsubscribe();
          resolve(state);
        }
      });
    });

    // Reject the review
    actor.send({
      type: "REJECT",
      stageId: "review:project",
      reviewId: "test-review-id",
      notes: "Rejected for testing"
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    const finalState = actor.getSnapshot();
    expect(finalState.value).toBe("error");
    expect(finalState.context.lastError).toContain("Review rejected");
  });

  it("should handle RETRY event from error state", async () => {
    const actor = createActor(tytonMachine, { input: mockContext });
    actor.start();

    // Manually transition to error state
    actor.send({ type: "START" });
    
    await new Promise(resolve => {
      const subscription = actor.subscribe(state => {
        if (state.value === "waiting_review") {
          subscription.unsubscribe();
          resolve(state);
        }
      });
    });

    // Reject to get to error state
    actor.send({
      type: "REJECT",
      stageId: "review:project",
      reviewId: "test-review-id"
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(actor.getSnapshot().value).toBe("error");

    // Retry from error
    actor.send({ type: "RETRY", stageId: "review:project" });

    expect(actor.getSnapshot().value).toBe("running");
    expect(actor.getSnapshot().context.retryCount).toBe(1);
  });

  it("should track retry count", () => {
    const actor = createActor(tytonMachine, { input: mockContext });
    actor.start();

    // First retry
    actor.send({ type: "RETRY", stageId: "test" });
    expect(actor.getSnapshot().context.retryCount).toBe(1);

    // Second retry
    actor.send({ type: "RETRY", stageId: "test" });
    expect(actor.getSnapshot().context.retryCount).toBe(2);
  });
});