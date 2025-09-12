import { vi } from 'vitest';
import { getOrchestrationPipeline } from '@/server/orchestrator/pipeline';

// Mock Prisma
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    promptRun: {
      create: vi.fn(),
    },
    module: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    connection: {
      create: vi.fn(),
    },
    bomItem: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    supplierLink: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  })),
}));

// Mock LLM services
vi.mock('@/server/llm/openai', () => ({
  getOpenAIService: vi.fn(() => ({
    complete: vi.fn().mockResolvedValue({
      text: 'Mock LLM response',
      json: { mock: 'data' }
    })
  }))
}));

describe('Pipeline Status API', () => {
  let pipeline: any;

  beforeEach(() => {
    pipeline = getOrchestrationPipeline();
  });

  describe('snapshotStatus', () => {
    it('should return idle status when no runs exist', () => {
      const status = pipeline.snapshotStatus('test-project-123');
      
      expect(status).toEqual({
        status: 'idle',
        stages: [],
        issues: { erc: [], drc: [] },
        schematic: null,
        summary: null
      });
    });

    it('should return run status when orchestration is active', async () => {
      // Start an orchestration
      const { runId } = await pipeline.startOrchestration('test-project-123', {
        maxConcurrency: 2
      });

      // Get status
      const status = pipeline.snapshotStatus('test-project-123', runId);
      
      expect(status).toMatchObject({
        status: expect.any(String),
        stages: expect.any(Array),
        issues: { erc: [], drc: [] }
      });

      expect(['starting', 'running', 'paused', 'cancelling', 'done', 'error'])
        .toContain(status.status);
    });

    it('should include stage information', async () => {
      const { runId } = await pipeline.startOrchestration('test-project-123');
      
      // Wait a moment for stages to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = pipeline.snapshotStatus('test-project-123', runId);
      
      expect(status.stages).toBeDefined();
      expect(Array.isArray(status.stages)).toBe(true);
      
      if (status.stages.length > 0) {
        const stage = status.stages[0];
        expect(stage).toMatchObject({
          id: expect.any(String),
          status: expect.stringMatching(/^(pending|running|done|error)$/),
          attempts: expect.any(Number)
        });
      }
    });

    it('should handle multiple concurrent runs', async () => {
      const { runId: runId1 } = await pipeline.startOrchestration('test-project-123');
      const { runId: runId2 } = await pipeline.startOrchestration('test-project-456');
      
      const status1 = pipeline.snapshotStatus('test-project-123', runId1);
      const status2 = pipeline.snapshotStatus('test-project-456', runId2);
      
      expect(status1).toBeDefined();
      expect(status2).toBeDefined();
      expect(status1.status).toBeDefined();
      expect(status2.status).toBeDefined();
    });

    it('should find most recent run when no runId specified', async () => {
      // Start multiple runs for the same project
      await pipeline.startOrchestration('test-project-123');
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
      const { runId: latestRunId } = await pipeline.startOrchestration('test-project-123');
      
      const statusWithoutRunId = pipeline.snapshotStatus('test-project-123');
      const statusWithRunId = pipeline.snapshotStatus('test-project-123', latestRunId);
      
      // Should return the same status (most recent run)
      expect(statusWithoutRunId.status).toBe(statusWithRunId.status);
    });
  });

  describe('startOrchestration', () => {
    it('should create a new orchestration run', async () => {
      const result = await pipeline.startOrchestration('test-project-123');
      
      expect(result).toMatchObject({
        runId: expect.stringMatching(/^run_\d+_[a-z0-9]+$/)
      });
    });

    it('should accept orchestration options', async () => {
      const result = await pipeline.startOrchestration('test-project-123', {
        resumeFromStage: 'components',
        maxConcurrency: 5
      });
      
      expect(result.runId).toBeDefined();
      
      const status = pipeline.snapshotStatus('test-project-123', result.runId);
      expect(status).toBeDefined();
    });

    it('should initialize stages based on resumeFromStage', async () => {
      const { runId } = await pipeline.startOrchestration('test-project-123', {
        resumeFromStage: 'firmware'
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = pipeline.snapshotStatus('test-project-123', runId);
      
      // Should only include stages from 'firmware' onwards
      const stageIds = status.stages.map((s: any) => s.id);
      expect(stageIds).not.toContain('meta');
      expect(stageIds).not.toContain('components');
      expect(stageIds).toContain('firmware');
    });
  });

  describe('Control Operations', () => {
    let runId: string;

    beforeEach(async () => {
      const result = await pipeline.startOrchestration('test-project-123');
      runId = result.runId;
    });

    it('should pause orchestration', () => {
      const success = pipeline.pauseOrchestration(runId);
      expect(success).toBe(true);
      
      const status = pipeline.snapshotStatus('test-project-123', runId);
      expect(status.status).toBe('paused');
    });

    it('should resume orchestration', () => {
      // First pause
      pipeline.pauseOrchestration(runId);
      
      // Then resume
      const success = pipeline.resumeOrchestration(runId);
      expect(success).toBe(true);
      
      const status = pipeline.snapshotStatus('test-project-123', runId);
      expect(status.status).toBe('running');
    });

    it('should cancel orchestration', () => {
      const success = pipeline.cancelOrchestration(runId);
      expect(success).toBe(true);
      
      const status = pipeline.snapshotStatus('test-project-123', runId);
      expect(status.status).toBe('cancelling');
    });

    it('should return false for invalid runId', () => {
      const pauseResult = pipeline.pauseOrchestration('invalid-run-id');
      const resumeResult = pipeline.resumeOrchestration('invalid-run-id');
      const cancelResult = pipeline.cancelOrchestration('invalid-run-id');
      
      expect(pauseResult).toBe(false);
      expect(resumeResult).toBe(false);
      expect(cancelResult).toBe(false);
    });
  });

  describe('Status API Shape', () => {
    it('should match expected schema structure', async () => {
      const { runId } = await pipeline.startOrchestration('test-project-123');
      const status = pipeline.snapshotStatus('test-project-123', runId);
      
      // Verify required fields
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('stages');
      expect(status).toHaveProperty('issues');
      expect(status.issues).toHaveProperty('erc');
      expect(status.issues).toHaveProperty('drc');
      
      // Verify types
      expect(typeof status.status).toBe('string');
      expect(Array.isArray(status.stages)).toBe(true);
      expect(Array.isArray(status.issues.erc)).toBe(true);
      expect(Array.isArray(status.issues.drc)).toBe(true);
      
      // Optional fields
      if (status.schematic !== null) {
        expect(typeof status.schematic).toBe('object');
      }
      
      if (status.summary !== null) {
        expect(typeof status.summary).toBe('object');
      }
      
      if (status.lastError !== undefined) {
        expect(typeof status.lastError).toBe('string');
      }
    });

    it('should include stages with proper structure', async () => {
      const { runId } = await pipeline.startOrchestration('test-project-123');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = pipeline.snapshotStatus('test-project-123', runId);
      
      if (status.stages.length > 0) {
        const stage = status.stages[0];
        
        expect(stage).toMatchObject({
          id: expect.any(String),
          status: expect.stringMatching(/^(pending|running|done|error)$/),
          attempts: expect.any(Number)
        });
        
        // Optional fields
        if (stage.message !== undefined) {
          expect(typeof stage.message).toBe('string');
        }
        
        if (stage.startedAt !== undefined) {
          expect(stage.startedAt).toBeInstanceOf(Date);
        }
        
        if (stage.completedAt !== undefined) {
          expect(stage.completedAt).toBeInstanceOf(Date);
        }
        
        if (stage.error !== undefined) {
          expect(typeof stage.error).toBe('string');
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing project gracefully', async () => {
      // This should not throw, but may result in error status
      const { runId } = await pipeline.startOrchestration('non-existent-project');
      expect(runId).toBeDefined();
      
      const status = pipeline.snapshotStatus('non-existent-project', runId);
      expect(status).toBeDefined();
    });

    it('should preserve error state in status', async () => {
      const { runId } = await pipeline.startOrchestration('test-project-123');
      
      // Force an error by cancelling
      pipeline.cancelOrchestration(runId);
      
      const status = pipeline.snapshotStatus('test-project-123', runId);
      expect(status.status).toBe('cancelling');
    });
  });
});