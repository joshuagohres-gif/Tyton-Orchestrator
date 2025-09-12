import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { llmRouter } from '../server/llm/router';
import { getRedisCache } from '../server/cache/redis';
import { prisma } from '../server/db/client';

// Mock dependencies
vi.mock('../server/cache/redis', () => ({
  getRedisCache: vi.fn()
}));

vi.mock('../server/db/client', () => ({
  prisma: {
    llmUsage: {
      create: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn()
    },
    project: {
      findUnique: vi.fn()
    }
  }
}));

vi.mock('../server/llm/openai', () => ({
  getOpenAIService: vi.fn()
}));

vi.mock('../server/llm/anthropic', () => ({
  getAnthropicService: vi.fn()
}));

vi.mock('../server/resilience/serviceBreakers', () => ({
  getServiceCircuitBreakers: vi.fn(() => ({
    executeLLMOperation: vi.fn((name, fn) => fn())
  }))
}));

vi.mock('../server/cache/cachedLlm', () => ({
  getCachedLlmService: vi.fn(() => ({
    completeStructured: vi.fn(),
    complete: vi.fn()
  }))
}));

const mockRedisCache = {
  get: vi.fn(),
  set: vi.fn(),
  getOrSet: vi.fn(),
  isConnected: vi.fn().mockReturnValue(true)
};

describe('LLM Router - Phase 3 Enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup environment variables
    process.env.CACHE_ENABLED = 'true';
    process.env.LLM_BUDGET_DEFAULT_USD = '25';
    process.env.LLM_BATCH_WINDOW_MS = '100';
    process.env.LLM_MAX_BATCH_SIZE = '3';
    process.env.MODEL_OPENAI = 'gpt-4o-mini';
    process.env.MODEL_ANTHROPIC = 'claude-3-5-haiku-20241022';
    
    // Setup mocks
    vi.mocked(getRedisCache).mockReturnValue(mockRedisCache as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Inflight Request Deduplication', () => {
    it('should deduplicate identical inflight requests', async () => {
      const mockResult = { result: '{"success": true}', cached: false };
      
      // Mock the cached LLM service
      const mockCachedLlm = {
        completeStructured: vi.fn().mockResolvedValue({
          data: { success: true },
          response: { cached: false, model: 'gpt-4o-mini', tokenUsage: { prompt: 10, completion: 5 } }
        })
      };
      
      // First request acquires lock
      mockRedisCache.getOrSet.mockResolvedValueOnce(Date.now().toString());
      mockRedisCache.get.mockResolvedValue(null);
      
      const request1 = llmRouter.completeJSONCached({
        system: 'Test system',
        user: 'Test user',
        options: { 
          userId: 'user1',
          enableDeduplication: true
        }
      });

      // Second identical request should wait
      mockRedisCache.getOrSet.mockResolvedValueOnce(null); // Lock exists
      mockRedisCache.get.mockResolvedValueOnce(mockResult); // Result available

      const request2 = llmRouter.completeJSONCached({
        system: 'Test system',
        user: 'Test user',
        options: { 
          userId: 'user1',
          enableDeduplication: true
        }
      });

      const [result1, result2] = await Promise.all([request1, request2]);

      expect(result1).toEqual(expect.objectContaining({ result: expect.any(String) }));
      expect(result2).toEqual(mockResult);
    });
  });

  describe('Tiered Model Selection', () => {
    it('should select economy models for low priority requests', () => {
      const router = llmRouter as any;
      const selectedModel = router.selectOptimalModel('low', 'Simple question');
      expect(selectedModel).toBe('gpt-4o-mini');
    });

    it('should select premium models for critical priority requests', () => {
      const router = llmRouter as any;
      const selectedModel = router.selectOptimalModel('critical', 'Complex analysis needed');
      expect(selectedModel).toBe('claude-3-5-haiku-20241022'); // Based on env
    });

    it('should select premium models for complex prompts', () => {
      const router = llmRouter as any;
      const complexPrompt = 'Analyze this complex algorithm and provide detailed reasoning with multiple steps';
      const selectedModel = router.selectOptimalModel('medium', complexPrompt);
      expect(selectedModel).toBe('claude-3-5-haiku-20241022');
    });

    it('should assess prompt complexity correctly', () => {
      const router = llmRouter as any;
      
      expect(router.assessPromptComplexity('Simple question')).toBe(false);
      expect(router.assessPromptComplexity('Analyze complex technical algorithm with detailed reasoning')).toBe(true);
      expect(router.assessPromptComplexity('A'.repeat(6000))).toBe(true); // Long prompt
    });
  });

  describe('Budget Enforcement', () => {
    it('should allow requests within user budget', async () => {
      mockPrisma.llmUsage.aggregate.mockResolvedValueOnce({
        _sum: { cost: 10.0 } // Under $25 budget
      });

      const router = llmRouter as any;
      await expect(router.checkUserBudget('user1')).resolves.not.toThrow();
    });

    it('should reject requests exceeding user budget', async () => {
      mockPrisma.llmUsage.aggregate.mockResolvedValueOnce({
        _sum: { cost: 30.0 } // Over $25 budget
      });

      const router = llmRouter as any;
      await expect(router.checkUserBudget('user1')).rejects.toThrow('User budget exceeded');
    });

    it('should check project budgets when specified', async () => {
      // User usage under budget
      mockPrisma.llmUsage.aggregate
        .mockResolvedValueOnce({ _sum: { cost: 10.0 } }) // User usage
        .mockResolvedValueOnce({ _sum: { cost: 60.0 } }); // Project usage

      mockPrisma.project.findUnique.mockResolvedValueOnce({
        llmBudget: 50.0
      });

      const router = llmRouter as any;
      await expect(router.checkUserBudget('user1', 'project1')).rejects.toThrow('Project budget exceeded');
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate costs correctly for different models', () => {
      const router = llmRouter as any;
      
      const gptCost = router.calculateCost(
        { prompt: 1000, completion: 500 }, 
        'gpt-4o-mini'
      );
      expect(gptCost).toBeCloseTo(0.00015 + 0.0003); // Prompt + completion
      
      const claudeCost = router.calculateCost(
        { prompt: 1000, completion: 500 }, 
        'claude-3-5-sonnet-20241022'
      );
      expect(claudeCost).toBeCloseTo(0.003 + 0.0075); // Prompt + completion
    });

    it('should handle missing token usage', () => {
      const router = llmRouter as any;
      expect(router.calculateCost(null, 'gpt-4o-mini')).toBe(0);
      expect(router.calculateCost({}, 'gpt-4o-mini')).toBe(0);
    });

    it('should provide fallback cost for unknown models', () => {
      const router = llmRouter as any;
      const cost = router.calculateCost({ prompt: 1000 }, 'unknown-model');
      expect(cost).toBe(0.001);
    });
  });

  describe('Usage Tracking', () => {
    it('should track LLM usage in database', async () => {
      mockPrisma.llmUsage.create.mockResolvedValueOnce({});

      const router = llmRouter as any;
      await router.trackLLMUsage('user1', 'project1', {
        model: 'gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.001,
        cached: false
      });

      expect(mockPrisma.llmUsage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user1',
          projectId: 'project1',
          model: 'gpt-4o-mini',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cost: 0.001,
          cached: false
        })
      });
    });

    it('should handle tracking failures gracefully', async () => {
      mockPrisma.llmUsage.create.mockRejectedValueOnce(new Error('DB error'));

      const router = llmRouter as any;
      await expect(router.trackLLMUsage('user1', 'project1', {
        model: 'gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 50,
        cost: 0.001,
        cached: false
      })).resolves.not.toThrow();
    });
  });

  describe('Usage Statistics', () => {
    it('should return comprehensive usage statistics', async () => {
      mockPrisma.llmUsage.aggregate.mockResolvedValueOnce({
        _sum: { cost: 15.5, totalTokens: 5000 },
        _count: 25,
        _avg: { cached: 0.6 }
      });

      mockPrisma.llmUsage.groupBy.mockResolvedValueOnce([
        { model: 'gpt-4o-mini', _sum: { cost: 10.0 }, _count: 20 },
        { model: 'claude-3-5-sonnet-20241022', _sum: { cost: 5.5 }, _count: 5 }
      ]);

      const stats = await llmRouter.getUsageStats('user1');

      expect(stats).toEqual({
        totalCost: 15.5,
        totalTokens: 5000,
        requestCount: 25,
        cacheHitRate: 60,
        modelBreakdown: [
          { model: 'gpt-4o-mini', cost: 10.0, requests: 20 },
          { model: 'claude-3-5-sonnet-20241022', cost: 5.5, requests: 5 }
        ]
      });
    });
  });

  describe('Request Batching', () => {
    it('should batch multiple requests efficiently', async () => {
      vi.useFakeTimers();
      
      const mockResults = [
        { result: '{"result": "A"}', cached: false },
        { result: '{"result": "B"}', cached: false },
        { result: '{"result": "C"}', cached: false }
      ];

      // Mock the completeJSONCached method to avoid circular calls
      const originalMethod = llmRouter.completeJSONCached;
      vi.spyOn(llmRouter, 'completeJSONCached').mockImplementation(async ({ user }) => {
        const index = user === 'Request A' ? 0 : user === 'Request B' ? 1 : 2;
        return mockResults[index];
      });

      const requests = [
        llmRouter.completeJSONBatched({
          system: 'Test',
          user: 'Request A',
          options: { userId: 'user1' }
        }),
        llmRouter.completeJSONBatched({
          system: 'Test', 
          user: 'Request B',
          options: { userId: 'user1' }
        }),
        llmRouter.completeJSONBatched({
          system: 'Test',
          user: 'Request C', 
          options: { userId: 'user1' }
        })
      ];

      // Should trigger batch processing when max size reached
      const results = await Promise.all(requests);

      expect(results).toHaveLength(3);
      expect(results[0].result).toBe('{"result": "A"}');
      expect(results[1].result).toBe('{"result": "B"}');
      expect(results[2].result).toBe('{"result": "C"}');

      vi.restoreAllMocks();
      vi.useRealTimers();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow with all Phase 3 features', async () => {
      // Setup mocks for full workflow
      mockPrisma.llmUsage.aggregate.mockResolvedValue({
        _sum: { cost: 5.0 } // Under budget
      });
      
      mockRedisCache.getOrSet.mockResolvedValue(Date.now().toString()); // Acquire lock
      mockRedisCache.get.mockResolvedValue(null);
      
      const mockCachedLlm = {
        completeStructured: vi.fn().mockResolvedValue({
          data: { analysis: 'complete' },
          response: { 
            cached: false, 
            model: 'gpt-4o-mini',
            tokenUsage: { prompt: 200, completion: 100 }
          }
        })
      };

      const result = await llmRouter.completeJSONCached({
        system: 'Analyze the following data',
        user: 'Complex data analysis request',
        options: {
          userId: 'user1',
          projectId: 'project1',
          priority: 'high',
          enableDeduplication: true,
          budgetCheck: true
        }
      });

      expect(result).toEqual(expect.objectContaining({
        result: expect.any(String),
        cached: false,
        cost: expect.any(Number),
        model: expect.any(String)
      }));
    });
  });
});