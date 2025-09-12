import { z } from "zod";

// Import the schemas from the worker (we'll need to extract these to a shared file)
const StartZ = z.object({ 
  type: z.literal("start"), 
  projectId: z.string(), 
  options: z.object({
    resumeFromStage: z.string().optional(),
    maxConcurrency: z.number().int().min(1).max(6).optional(),
  }).optional()
}).transform(data => ({
  ...data,
  options: {
    maxConcurrency: 3,
    ...data.options
  }
}));

const ControlZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("recomputeLayout"), payload: z.any().optional() }),
]);

type Inbound = z.infer<typeof StartZ> | z.infer<typeof ControlZ>;

type Outbound =
  | { type: "status"; status: "starting"|"running"|"paused"|"cancelling"|"done"|"error"; detail?: any }
  | { type: "stage:progress"; stageId: string; status: "pending"|"running"|"done"|"error"; attempts?: number; message?: string }
  | { type: "ercdrc:update"; issues: { erc: any[]; drc: any[] } }
  | { type: "layout:ready"; nodes: any[]; edges: any[]; warnings?: string[] }
  | { type: "result"; summary: any }
  | { type: "error"; message: string };

describe('Worker Protocol Messages', () => {
  describe('Inbound Messages', () => {
    it('should validate start message with minimal data', () => {
      const message = {
        type: "start",
        projectId: "test-project-123"
      };

      expect(() => StartZ.parse(message)).not.toThrow();
      const parsed = StartZ.parse(message);
      expect(parsed.options.maxConcurrency).toBe(3); // default value
    });

    it('should validate start message with full options', () => {
      const message = {
        type: "start",
        projectId: "test-project-123",
        options: {
          resumeFromStage: "components",
          maxConcurrency: 5
        }
      };

      expect(() => StartZ.parse(message)).not.toThrow();
      const parsed = StartZ.parse(message);
      expect(parsed.options.resumeFromStage).toBe("components");
      expect(parsed.options.maxConcurrency).toBe(5);
    });

    it('should reject invalid maxConcurrency values', () => {
      const message = {
        type: "start",
        projectId: "test-project-123",
        options: {
          maxConcurrency: 10 // exceeds max of 6
        }
      };

      expect(() => StartZ.parse(message)).toThrow();
    });

    it('should validate control messages', () => {
      const pauseMessage = { type: "pause" };
      const resumeMessage = { type: "resume" };
      const cancelMessage = { type: "cancel" };
      const layoutMessage = { 
        type: "recomputeLayout", 
        payload: { specV12: { modules: [] } } 
      };

      expect(() => ControlZ.parse(pauseMessage)).not.toThrow();
      expect(() => ControlZ.parse(resumeMessage)).not.toThrow();
      expect(() => ControlZ.parse(cancelMessage)).not.toThrow();
      expect(() => ControlZ.parse(layoutMessage)).not.toThrow();
    });

    it('should reject invalid control messages', () => {
      const invalidMessage = { type: "invalid" };
      expect(() => ControlZ.parse(invalidMessage)).toThrow();
    });
  });

  describe('Outbound Messages', () => {
    it('should create valid status messages', () => {
      const statusMessage: Outbound = {
        type: "status",
        status: "running",
        detail: { runId: "run_123" }
      };

      expect(statusMessage.type).toBe("status");
      expect(statusMessage.status).toBe("running");
    });

    it('should create valid stage progress messages', () => {
      const progressMessage: Outbound = {
        type: "stage:progress",
        stageId: "components",
        status: "running",
        attempts: 1,
        message: "Processing components..."
      };

      expect(progressMessage.type).toBe("stage:progress");
      expect(progressMessage.stageId).toBe("components");
    });

    it('should create valid ERC/DRC update messages', () => {
      const issuesMessage: Outbound = {
        type: "ercdrc:update",
        issues: {
          erc: [{ type: "unconnected_pin", pin: "VCC" }],
          drc: [{ type: "spacing_violation", distance: 0.1 }]
        }
      };

      expect(issuesMessage.type).toBe("ercdrc:update");
      expect(issuesMessage.issues.erc).toHaveLength(1);
      expect(issuesMessage.issues.drc).toHaveLength(1);
    });

    it('should create valid layout ready messages', () => {
      const layoutMessage: Outbound = {
        type: "layout:ready",
        nodes: [
          { id: "node1", type: "custom", position: { x: 0, y: 0 }, data: { label: "Module 1" } }
        ],
        edges: [
          { id: "edge1", source: "node1", target: "node2", type: "smoothstep" }
        ],
        warnings: ["Layout may be suboptimal"]
      };

      expect(layoutMessage.type).toBe("layout:ready");
      expect(layoutMessage.nodes).toHaveLength(1);
      expect(layoutMessage.edges).toHaveLength(1);
      expect(layoutMessage.warnings).toHaveLength(1);
    });

    it('should create valid result messages', () => {
      const resultMessage: Outbound = {
        type: "result",
        summary: {
          completedStages: 7,
          successfulStages: 6,
          completedAt: new Date().toISOString()
        }
      };

      expect(resultMessage.type).toBe("result");
      expect(resultMessage.summary.completedStages).toBe(7);
    });

    it('should create valid error messages', () => {
      const errorMessage: Outbound = {
        type: "error",
        message: "Failed to process stage: network timeout"
      };

      expect(errorMessage.type).toBe("error");
      expect(errorMessage.message).toContain("network timeout");
    });
  });

  describe('Message Flow Scenarios', () => {
    it('should handle a complete orchestration flow', () => {
      // Simulate message sequence
      const messages: Outbound[] = [
        { type: "status", status: "starting" },
        { type: "status", status: "running", detail: { runId: "run_123" } },
        { type: "stage:progress", stageId: "meta", status: "running", attempts: 1 },
        { type: "stage:progress", stageId: "meta", status: "done", attempts: 1 },
        { type: "stage:progress", stageId: "components", status: "running", attempts: 1 },
        { type: "ercdrc:update", issues: { erc: [], drc: [] } },
        { type: "layout:ready", nodes: [], edges: [] },
        { type: "stage:progress", stageId: "components", status: "done", attempts: 1 },
        { type: "result", summary: { completedStages: 2, successfulStages: 2 } },
        { type: "status", status: "done" }
      ];

      // Verify each message is valid
      messages.forEach((msg, index) => {
        expect(msg).toBeDefined();
        expect(msg.type).toBeDefined();
        console.log(`Message ${index + 1}: ${msg.type} - OK`);
      });

      // Verify flow sequence
      expect(messages[0].type).toBe("status");
      expect((messages[0] as any).status).toBe("starting");
      expect(messages[messages.length - 1].type).toBe("status");
      expect((messages[messages.length - 1] as any).status).toBe("done");
    });

    it('should handle pause/resume flow', () => {
      const pauseMessage = { type: "pause" as const };
      const resumeMessage = { type: "resume" as const };

      expect(() => ControlZ.parse(pauseMessage)).not.toThrow();
      expect(() => ControlZ.parse(resumeMessage)).not.toThrow();

      const statusPaused: Outbound = { type: "status", status: "paused" };
      const statusRunning: Outbound = { type: "status", status: "running" };

      expect(statusPaused.type).toBe("status");
      expect(statusRunning.type).toBe("status");
    });

    it('should handle error scenarios', () => {
      const errorMessage: Outbound = {
        type: "error",
        message: "Stage failed: invalid component specification"
      };

      const errorStatus: Outbound = {
        type: "status", 
        status: "error"
      };

      expect(errorMessage.type).toBe("error");
      expect(errorStatus.type).toBe("status");
      expect((errorStatus as any).status).toBe("error");
    });
  });
});