import pLimit from "p-limit";
import { STAGES, StageId } from "./stageRegistry";

/**
 * Compute topological sort layers for parallel execution
 * Uses Kahn's algorithm to detect cycles and compute dependency layers
 */
export function topoLayers(): StageId[][] {
  const deps = new Map<StageId, Set<StageId>>();
  const reverseDeps = new Map<StageId, Set<StageId>>();
  
  // Initialize dependency maps
  Object.values(STAGES).forEach(stage => {
    deps.set(stage.id, new Set(stage.deps));
    reverseDeps.set(stage.id, new Set());
  });

  // Build reverse dependency map
  Object.values(STAGES).forEach(stage => {
    stage.deps.forEach(depId => {
      if (!reverseDeps.has(depId)) {
        throw new Error(`Stage "${stage.id}" depends on unknown stage "${depId}"`);
      }
      reverseDeps.get(depId)!.add(stage.id);
    });
  });

  const layers: StageId[][] = [];
  const remaining = new Set(Object.keys(STAGES) as StageId[]);
  const inDegree = new Map<StageId, number>();

  // Calculate initial in-degrees
  remaining.forEach(id => {
    inDegree.set(id, deps.get(id)!.size);
  });

  // Kahn's algorithm for topological sort
  while (remaining.size > 0) {
    // Find all nodes with no incoming edges
    const ready: StageId[] = [];
    for (const id of remaining) {
      if (inDegree.get(id) === 0) {
        ready.push(id);
      }
    }

    if (ready.length === 0) {
      const remainingList = Array.from(remaining);
      throw new Error(
        `Cyclic dependency detected among stages: ${remainingList.join(", ")}. ` +
        `Check stage dependencies for circular references.`
      );
    }

    // Add ready nodes to current layer
    layers.push([...ready]);

    // Remove ready nodes and update in-degrees
    ready.forEach(readyId => {
      remaining.delete(readyId);
      
      // Decrease in-degree for all dependent stages
      reverseDeps.get(readyId)!.forEach(dependentId => {
        if (remaining.has(dependentId)) {
          inDegree.set(dependentId, inDegree.get(dependentId)! - 1);
        }
      });
    });
  }

  return layers;
}

/**
 * Run a layer of stages in parallel with controlled concurrency
 */
export async function runLayer(
  layer: StageId[],
  runStage: (id: StageId) => Promise<void>,
  concurrency?: number,
  onStageStart?: (stageId: StageId) => void,
  onStageComplete?: (stageId: StageId, duration: number) => void,
  onStageError?: (stageId: StageId, error: any, duration: number) => void
): Promise<{ 
  results: Map<StageId, { success: boolean; duration: number; error?: any }>;
  totalDuration: number;
  maxConcurrentDuration: number;
}> {
  // Get concurrency from environment or use default
  const effectiveConcurrency = concurrency ?? 
    parseInt(process.env.ORCH_CONCURRENCY || '3', 10);
  
  const limit = pLimit(effectiveConcurrency);
  const results = new Map<StageId, { success: boolean; duration: number; error?: any }>();
  const layerStartTime = Date.now();
  
  console.log(`[DAG] Running layer with ${layer.length} stages (concurrency: ${effectiveConcurrency})`);
  
  const promises = layer.map(id => 
    limit(async () => {
      console.log(`[DAG] Starting stage: ${id}`);
      const startTime = Date.now();
      
      onStageStart?.(id);
      
      try {
        await runStage(id);
        const duration = Date.now() - startTime;
        
        results.set(id, { success: true, duration });
        console.log(`[DAG] Stage ${id} completed in ${duration}ms`);
        
        onStageComplete?.(id, duration);
      } catch (error) {
        const duration = Date.now() - startTime;
        
        results.set(id, { success: false, duration, error });
        console.error(`[DAG] Stage ${id} failed after ${duration}ms:`, error);
        
        onStageError?.(id, error, duration);
        throw error;
      }
    })
  );

  await Promise.all(promises);
  
  const totalDuration = Array.from(results.values())
    .reduce((sum, result) => sum + result.duration, 0);
  const maxConcurrentDuration = Date.now() - layerStartTime;
  
  console.log(`[DAG] Layer completed - Sequential would take: ${totalDuration}ms, Parallel took: ${maxConcurrentDuration}ms`);
  
  return {
    results,
    totalDuration,
    maxConcurrentDuration
  };
}

/**
 * Validate stage dependency graph
 */
export function validateStageGraph(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for self-dependencies
  Object.values(STAGES).forEach(stage => {
    if (stage.deps.includes(stage.id)) {
      errors.push(`Stage "${stage.id}" cannot depend on itself`);
    }
  });

  // Check for missing dependencies
  Object.values(STAGES).forEach(stage => {
    stage.deps.forEach(depId => {
      if (!STAGES[depId]) {
        errors.push(`Stage "${stage.id}" depends on unknown stage "${depId}"`);
      }
    });
  });

  // Check for cycles using DFS
  const visited = new Set<StageId>();
  const visiting = new Set<StageId>();

  function hasCycle(stageId: StageId): boolean {
    if (visiting.has(stageId)) {
      return true; // Back edge found
    }
    if (visited.has(stageId)) {
      return false; // Already processed
    }

    visiting.add(stageId);
    
    const stage = STAGES[stageId];
    for (const depId of stage.deps) {
      if (hasCycle(depId)) {
        return true;
      }
    }

    visiting.delete(stageId);
    visited.add(stageId);
    return false;
  }

  for (const stageId of Object.keys(STAGES) as StageId[]) {
    if (!visited.has(stageId) && hasCycle(stageId)) {
      errors.push(`Circular dependency detected involving stage "${stageId}"`);
      break; // Only report first cycle found
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get the dependency path between two stages
 */
export function getDependencyPath(from: StageId, to: StageId): StageId[] | null {
  const visited = new Set<StageId>();
  const path: StageId[] = [];

  function dfs(current: StageId): boolean {
    if (current === to) {
      path.push(current);
      return true;
    }

    if (visited.has(current)) {
      return false;
    }

    visited.add(current);
    path.push(current);

    const stage = STAGES[current];
    for (const depId of stage.deps) {
      if (dfs(depId)) {
        return true;
      }
    }

    path.pop();
    return false;
  }

  return dfs(from) ? path : null;
}

/**
 * Analyze parallel execution performance vs sequential
 */
export function analyzeParallelPerformance(): {
  layers: StageId[][];
  sequentialEstimate: number;
  parallelEstimate: number;
  speedupFactor: number;
  criticalPath: StageId[];
  parallelizableStages: number;
  analysis: string;
} {
  const layers = topoLayers();
  
  // Assume average stage duration of 30 seconds for estimation
  const avgStageDuration = 30000;
  
  const totalStages = Object.keys(STAGES).length;
  const sequentialEstimate = totalStages * avgStageDuration;
  
  // Parallel estimate is sum of longest stage in each layer
  const parallelEstimate = layers.length * avgStageDuration;
  
  const speedupFactor = sequentialEstimate / parallelEstimate;
  
  // Find critical path (longest dependency chain)
  let criticalPath: StageId[] = [];
  let maxDepth = 0;
  
  function findDepth(stageId: StageId, visited = new Set<StageId>()): StageId[] {
    if (visited.has(stageId)) return [];
    visited.add(stageId);
    
    const stage = STAGES[stageId];
    if (stage.deps.length === 0) {
      return [stageId];
    }
    
    let longestPath: StageId[] = [];
    for (const depId of stage.deps) {
      const depPath = findDepth(depId, new Set(visited));
      if (depPath.length > longestPath.length) {
        longestPath = depPath;
      }
    }
    
    return [stageId, ...longestPath];
  }
  
  for (const stageId of Object.keys(STAGES) as StageId[]) {
    const path = findDepth(stageId);
    if (path.length > maxDepth) {
      maxDepth = path.length;
      criticalPath = path;
    }
  }
  
  const parallelizableStages = totalStages - criticalPath.length;
  
  const analysis = `
DAG Analysis:
- Total stages: ${totalStages}
- Execution layers: ${layers.length}
- Critical path length: ${criticalPath.length}
- Parallelizable stages: ${parallelizableStages}
- Estimated speedup: ${speedupFactor.toFixed(2)}x
- Sequential time: ${(sequentialEstimate / 1000).toFixed(1)}s
- Parallel time: ${(parallelEstimate / 1000).toFixed(1)}s

Layer breakdown:
${layers.map((layer, i) => `  Layer ${i + 1}: [${layer.join(', ')}]`).join('\n')}

Critical path: ${criticalPath.join(' → ')}
  `.trim();
  
  return {
    layers,
    sequentialEstimate,
    parallelEstimate,
    speedupFactor,
    criticalPath,
    parallelizableStages,
    analysis
  };
}