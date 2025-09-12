import { describe, it, expect, beforeEach, vi } from "vitest";
import { topoLayers, runLayer, validateStageGraph } from "@/server/orchestrator/state/dag";
import { STAGES } from "@/server/orchestrator/state/stageRegistry";

// Mock the stage registry with a dependency graph that has parallel stages
vi.mock("@/server/orchestrator/state/stageRegistry", () => ({
  STAGES: {
    "stage:a": {
      id: "stage:a",
      name: "Stage A",
      deps: [],
      run: vi.fn()
    },
    "stage:b": {
      id: "stage:b", 
      name: "Stage B",
      deps: ["stage:a"],
      run: vi.fn()
    },
    "stage:c": {
      id: "stage:c",
      name: "Stage C", 
      deps: ["stage:a"],
      run: vi.fn()
    },
    "stage:d": {
      id: "stage:d",
      name: "Stage D",
      deps: ["stage:b", "stage:c"],
      run: vi.fn()
    },
    "export:bom": {
      id: "export:bom",
      name: "BOM Export",
      deps: ["stage:b"],
      run: vi.fn()
    },
    "export:kicad": {
      id: "export:kicad", 
      name: "KiCad Export",
      deps: ["stage:b"],
      run: vi.fn()
    },
    "export:dsn": {
      id: "export:dsn",
      name: "DSN Export", 
      deps: ["stage:b"],
      run: vi.fn()
    }
  }
}));

describe("DAG Parallel Execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should compute correct topological layers", () => {
    const layers = topoLayers();

    expect(layers).toEqual([
      ["stage:a"],                                    // Layer 0: No dependencies
      ["stage:b", "stage:c"],                        // Layer 1: Depends only on stage:a (parallel)
      ["export:bom", "export:kicad", "export:dsn"], // Layer 2: All depend on stage:b (parallel)
      ["stage:d"]                                     // Layer 3: Depends on both stage:b and stage:c
    ]);
  });

  it("should validate dependency graph successfully", () => {
    const validation = validateStageGraph();
    
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("should detect cyclic dependencies", () => {
    // Temporarily mock a cyclic dependency
    const originalStages = { ...STAGES };
    
    vi.mocked(STAGES).mock.restore?.();
    vi.doMock("@/server/orchestrator/state/stageRegistry", () => ({
      STAGES: {
        "stage:a": { id: "stage:a", deps: ["stage:b"], run: vi.fn() },
        "stage:b": { id: "stage:b", deps: ["stage:a"], run: vi.fn() }
      }
    }));

    expect(() => topoLayers()).toThrow("Cyclic dependency detected");
  });

  it("should run stages in parallel within a layer", async () => {
    const executionTimes: Record<string, { start: number; end: number }> = {};
    
    const mockRunStage = vi.fn(async (stageId: string) => {
      executionTimes[stageId] = { start: Date.now(), end: 0 };
      
      // Simulate different execution times
      const delays = {
        "export:bom": 100,
        "export:kicad": 150, 
        "export:dsn": 80
      };
      
      await new Promise(resolve => 
        setTimeout(resolve, delays[stageId as keyof typeof delays] || 50)
      );
      
      executionTimes[stageId].end = Date.now();
    });

    // Run the parallel export layer
    const parallelLayer = ["export:bom", "export:kicad", "export:dsn"];
    const startTime = Date.now();
    
    await runLayer(parallelLayer, mockRunStage, 3);
    
    const totalTime = Date.now() - startTime;

    // Verify all stages were called
    expect(mockRunStage).toHaveBeenCalledTimes(3);
    expect(mockRunStage).toHaveBeenCalledWith("export:bom");
    expect(mockRunStage).toHaveBeenCalledWith("export:kicad");
    expect(mockRunStage).toHaveBeenCalledWith("export:dsn");

    // Verify parallel execution (total time should be less than sum of individual times)
    const individualTimes = Object.values(executionTimes).map(t => t.end - t.start);
    const sumOfIndividualTimes = individualTimes.reduce((sum, time) => sum + time, 0);
    
    expect(totalTime).toBeLessThan(sumOfIndividualTimes);
    
    // Verify stages ran concurrently (overlapping time windows)
    const sortedStarts = Object.values(executionTimes)
      .map(t => t.start)
      .sort((a, b) => a - b);
    const sortedEnds = Object.values(executionTimes)
      .map(t => t.end)
      .sort((a, b) => a - b);
    
    // The first stage should start before the last stage ends (overlap)
    expect(sortedStarts[0]).toBeLessThan(sortedEnds[sortedEnds.length - 1]);
  });

  it("should respect concurrency limits", async () => {
    const activeTasks = new Set<string>();
    const maxConcurrent = { value: 0 };
    
    const mockRunStage = vi.fn(async (stageId: string) => {
      activeTasks.add(stageId);
      maxConcurrent.value = Math.max(maxConcurrent.value, activeTasks.size);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      activeTasks.delete(stageId);
    });

    const layer = ["export:bom", "export:kicad", "export:dsn"];
    await runLayer(layer, mockRunStage, 2); // Limit to 2 concurrent

    expect(maxConcurrent.value).toBeLessThanOrEqual(2);
    expect(mockRunStage).toHaveBeenCalledTimes(3);
  });

  it("should handle stage failures without affecting parallel stages", async () => {
    const results: Record<string, "success" | "error"> = {};
    
    const mockRunStage = vi.fn(async (stageId: string) => {
      if (stageId === "export:kicad") {
        results[stageId] = "error";
        throw new Error("KiCad export failed");
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      results[stageId] = "success";
    });

    const layer = ["export:bom", "export:kicad", "export:dsn"];
    
    // Should throw because one stage failed
    await expect(runLayer(layer, mockRunStage, 3)).rejects.toThrow("KiCad export failed");
    
    // But other stages should still have been attempted
    expect(mockRunStage).toHaveBeenCalledTimes(3);
  });

  it("should handle empty layers gracefully", async () => {
    const mockRunStage = vi.fn();
    
    await runLayer([], mockRunStage, 3);
    
    expect(mockRunStage).not.toHaveBeenCalled();
  });

  it("should find dependency paths between stages", () => {
    const { getDependencyPath } = require("@/server/orchestrator/state/dag");
    
    // Test direct dependency
    expect(getDependencyPath("stage:b", "stage:a")).toEqual(["stage:b", "stage:a"]);
    
    // Test indirect dependency  
    expect(getDependencyPath("stage:d", "stage:a")).toEqual(["stage:d", "stage:b", "stage:a"]);
    
    // Test no dependency path
    expect(getDependencyPath("stage:a", "stage:b")).toBeNull();
  });

  it("should detect missing dependencies", () => {
    const originalStages = { ...STAGES };
    
    vi.mocked(STAGES).mock.restore?.();
    vi.doMock("@/server/orchestrator/state/stageRegistry", () => ({
      STAGES: {
        "stage:a": { id: "stage:a", deps: ["nonexistent:stage"], run: vi.fn() }
      }
    }));

    const validation = validateStageGraph();
    
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Stage "stage:a" depends on unknown stage "nonexistent:stage"');
  });

  it("should detect self-dependencies", () => {
    const originalStages = { ...STAGES };
    
    vi.mocked(STAGES).mock.restore?.();
    vi.doMock("@/server/orchestrator/state/stageRegistry", () => ({
      STAGES: {
        "stage:a": { id: "stage:a", deps: ["stage:a"], run: vi.fn() }
      }
    }));

    const validation = validateStageGraph();
    
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('Stage "stage:a" cannot depend on itself');
  });
});