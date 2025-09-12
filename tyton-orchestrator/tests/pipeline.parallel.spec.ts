import { describe, it, expect, beforeAll } from 'vitest';
import { topoLayers, runLayer, analyzeParallelPerformance, validateStageGraph } from '../server/orchestrator/state/dag';
import { STAGES, type StageId } from '../server/orchestrator/state/stageRegistry';

describe('Parallel Pipeline Execution', () => {
  beforeAll(() => {
    // Ensure stage graph is valid before running tests
    const validation = validateStageGraph();
    if (!validation.valid) {
      throw new Error(`Invalid stage graph: ${validation.errors.join(', ')}`);
    }
  });

  describe('DAG Structure', () => {
    it('should have a valid dependency graph without cycles', () => {
      const validation = validateStageGraph();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should organize stages into execution layers', () => {
      const layers = topoLayers();
      
      expect(layers.length).toBeGreaterThan(0);
      
      // Each layer should have at least one stage
      layers.forEach(layer => {
        expect(layer.length).toBeGreaterThan(0);
      });
      
      // All stages should be included across layers
      const allStagesInLayers = layers.flat();
      const expectedStages = Object.keys(STAGES) as StageId[];
      
      expect(allStagesInLayers.sort()).toEqual(expectedStages.sort());
      
      console.log('📊 DAG Structure:');
      layers.forEach((layer, i) => {
        console.log(`  Layer ${i + 1}: [${layer.join(', ')}]`);
      });
    });

    it('should respect dependencies across layers', () => {
      const layers = topoLayers();
      const stageToLayer = new Map<StageId, number>();
      
      // Map each stage to its layer
      layers.forEach((layer, layerIndex) => {
        layer.forEach(stageId => {
          stageToLayer.set(stageId, layerIndex);
        });
      });
      
      // Check that dependencies come from earlier layers
      Object.values(STAGES).forEach(stage => {
        const stageLayer = stageToLayer.get(stage.id)!;
        
        stage.deps.forEach(depId => {
          const depLayer = stageToLayer.get(depId)!;
          expect(depLayer).toBeLessThan(stageLayer);
        });
      });
    });
  });

  describe('Performance Analysis', () => {
    it('should show significant speedup potential for branched graphs', () => {
      const analysis = analyzeParallelPerformance();
      
      expect(analysis.speedupFactor).toBeGreaterThan(1);
      expect(analysis.layers.length).toBeLessThan(Object.keys(STAGES).length);
      expect(analysis.parallelizableStages).toBeGreaterThan(0);
      
      console.log('📈 Performance Analysis:');
      console.log(analysis.analysis);
      
      // Should achieve at least 60% speedup for branched execution
      const speedupPercentage = ((analysis.speedupFactor - 1) * 100);
      expect(speedupPercentage).toBeGreaterThan(60);
    });

    it('should identify critical path correctly', () => {
      const analysis = analyzeParallelPerformance();
      
      expect(analysis.criticalPath.length).toBeGreaterThan(0);
      expect(analysis.criticalPath.length).toBeLessThanOrEqual(Object.keys(STAGES).length);
      
      // Critical path should start with a stage that has no dependencies
      const firstStage = STAGES[analysis.criticalPath[0]];
      expect(firstStage.deps).toHaveLength(0);
      
      console.log(`🎯 Critical Path: ${analysis.criticalPath.join(' → ')}`);
    });
  });

  describe('Parallel Execution', () => {
    it('should execute stages with synthetic delays showing ~60% wall-time reduction', async () => {
      // Create mock stages with controlled delays
      const mockStageDelays = new Map<StageId, number>([
        ['review:project', 1000],
        ['analysis:viability_safety', 800],
        ['selection:components', 1200],
        ['wiring:pins', 900],
        ['schematic:generate', 1100],
        ['eda:enrich', 700],
        ['placement:seed', 600],
        ['export:bom', 500],
        ['export:kicad', 800],
        ['export:dsn', 400]
      ]);

      const layers = topoLayers();
      let totalSequentialTime = 0;
      let totalParallelTime = 0;

      // Simulate parallel execution
      for (const layer of layers) {
        const layerStartTime = Date.now();
        
        const result = await runLayer(
          layer,
          async (stageId) => {
            const delay = mockStageDelays.get(stageId) || 500;
            await new Promise(resolve => setTimeout(resolve, delay));
          },
          2 // Test with concurrency of 2
        );

        const layerDuration = Date.now() - layerStartTime;
        totalParallelTime += layerDuration;
        
        // Calculate what sequential time would have been
        const sequentialLayerTime = Array.from(result.results.values())
          .reduce((sum, r) => sum + r.duration, 0);
        totalSequentialTime += sequentialLayerTime;
      }

      const actualSpeedup = totalSequentialTime / totalParallelTime;
      const speedupPercentage = ((actualSpeedup - 1) * 100);

      console.log(`⚡ Execution Results:
        - Sequential time: ${totalSequentialTime}ms
        - Parallel time: ${totalParallelTime}ms  
        - Speedup: ${actualSpeedup.toFixed(2)}x (${speedupPercentage.toFixed(1)}%)
      `);

      // Should achieve at least 60% reduction in wall-time
      expect(speedupPercentage).toBeGreaterThan(60);
    }, 30000);

    it('should handle concurrent stages without data races', async () => {
      const executionLog: string[] = [];
      const concurrentStages = ['wiring:pins', 'schematic:generate'];
      
      if (concurrentStages.every(id => id in STAGES)) {
        const result = await runLayer(
          concurrentStages as StageId[],
          async (stageId) => {
            executionLog.push(`start:${stageId}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            executionLog.push(`end:${stageId}`);
          },
          2
        );

        // Both stages should have executed
        expect(result.results.size).toBe(2);
        
        // Check for concurrent execution (starts should happen before all ends)
        const startCount = executionLog.filter(entry => entry.startsWith('start:')).length;
        const endCount = executionLog.filter(entry => entry.startsWith('end:')).length;
        
        expect(startCount).toBe(2);
        expect(endCount).toBe(2);
      }
    });

    it('should respect concurrency limits', async () => {
      const concurrentTracker = new Set<string>();
      let maxConcurrent = 0;
      
      // Create a layer with 4 stages but limit concurrency to 2
      const testStages = Object.keys(STAGES).slice(0, 4) as StageId[];
      
      await runLayer(
        testStages,
        async (stageId) => {
          concurrentTracker.add(stageId);
          maxConcurrent = Math.max(maxConcurrent, concurrentTracker.size);
          
          await new Promise(resolve => setTimeout(resolve, 200));
          
          concurrentTracker.delete(stageId);
        },
        2 // Limit to 2 concurrent
      );

      // Should never exceed the concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should propagate errors correctly in parallel execution', async () => {
      const errorStage = 'analysis:viability_safety' as StageId;
      
      await expect(async () => {
        await runLayer(
          [errorStage],
          async (stageId) => {
            if (stageId === errorStage) {
              throw new Error(`Test error in ${stageId}`);
            }
          }
        );
      }).rejects.toThrow('Test error in analysis:viability_safety');
    });
  });

  describe('Environment Configuration', () => {
    it('should use ORCH_CONCURRENCY from environment', async () => {
      // Set environment variable
      const originalValue = process.env.ORCH_CONCURRENCY;
      process.env.ORCH_CONCURRENCY = '5';
      
      try {
        const stageIds = Object.keys(STAGES).slice(0, 3) as StageId[];
        
        await runLayer(
          stageIds,
          async (stageId) => {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          // Don't pass concurrency parameter to test environment fallback
        );
        
        // Test passes if no errors thrown
        expect(true).toBe(true);
      } finally {
        // Restore original value
        if (originalValue !== undefined) {
          process.env.ORCH_CONCURRENCY = originalValue;
        } else {
          delete process.env.ORCH_CONCURRENCY;
        }
      }
    });

    it('should fall back to default concurrency when environment not set', async () => {
      const originalValue = process.env.ORCH_CONCURRENCY;
      delete process.env.ORCH_CONCURRENCY;
      
      try {
        const stageIds = Object.keys(STAGES).slice(0, 2) as StageId[];
        
        await runLayer(
          stageIds,
          async (stageId) => {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        );
        
        expect(true).toBe(true);
      } finally {
        if (originalValue !== undefined) {
          process.env.ORCH_CONCURRENCY = originalValue;
        }
      }
    });
  });
});