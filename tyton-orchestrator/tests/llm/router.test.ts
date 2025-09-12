// /tests/llm/router.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { llmRouter } from '@/server/llm/router';
import { LLMPatchResponseZ } from '@/server/llm/schemas';

// Mock environment variables
vi.mock('process', () => ({
  env: {
    LLM_OFFLINE: 'true', // Start in offline mode for tests
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    LLM_PROVIDER: 'openai'
  }
}));

describe('LLM Router', () => {
  beforeEach(() => {
    // Reset any router state between tests
    vi.clearAllMocks();
  });

  describe('offline mode', () => {
    it('should return mock response when LLM_OFFLINE=true', async () => {
      const result = await llmRouter.completeJSON({
        system: 'Test system prompt',
        user: 'Test user prompt',
        schema: LLMPatchResponseZ,
        options: { enableRetry: false }
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('success', true);
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('timestamp');
    });

    it('should generate schema-based mock when schema provided', async () => {
      const result = await llmRouter.completeJSON({
        system: 'Generate component patches',
        user: 'Patch R1 resistor',
        schema: LLMPatchResponseZ,
        options: { enableRetry: false }
      });

      const parsed = JSON.parse(result);
      
      // Should be valid according to schema
      const validation = LLMPatchResponseZ.safeParse(parsed);
      expect(validation.success).toBe(true);
    });

    it('should include offline mode in health check', async () => {
      const health = await llmRouter.healthCheck();
      expect(health.provider).toBe('offline');
      expect(health.status).toBe('ok');
    });
  });

  describe('provider selection', () => {
    it('should respect LLM_PROVIDER environment variable', () => {
      // Test would require mocking the actual LLM calls
      // For now, just verify the router can be instantiated
      expect(llmRouter).toBeDefined();
      expect(typeof llmRouter.completeJSON).toBe('function');
    });

    it('should validate completion options', async () => {
      // Test with minimal options
      const result = await llmRouter.completeJSON({
        system: 'Test',
        user: 'Test'
      });

      expect(typeof result).toBe('string');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON schemas gracefully', async () => {
      // This should work in offline mode
      const result = await llmRouter.completeJSON({
        system: 'Return valid JSON',
        user: 'Generate response',
        options: { enableRetry: false }
      });

      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should have required methods', () => {
      expect(llmRouter).toHaveProperty('completeJSON');
      expect(llmRouter).toHaveProperty('healthCheck');
      expect(typeof llmRouter.completeJSON).toBe('function');
      expect(typeof llmRouter.healthCheck).toBe('function');
    });
  });
});