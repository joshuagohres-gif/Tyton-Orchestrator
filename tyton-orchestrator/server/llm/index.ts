// /server/llm/index.ts
// Central export file for LLM infrastructure

export { llmRouter, type LLMProvider, type RouterOptions, type JSONCompletionOptions } from './router';
export { getOpenAIService, getOpenAIClient } from './openai';
export { getAnthropicService } from './anthropic';
export { withRetry } from './retry';
export { classifyLlmError } from './errors';
export * from './schemas';
export * from './prompts';

// Health check utility
export async function checkLLMHealth() {
  const { llmRouter } = await import('./router');
  return await llmRouter.healthCheck();
}

// Configuration check
export function validateLLMConfig(): { 
  ok: boolean; 
  provider?: string; 
  offline?: boolean; 
  errors?: string[] 
} {
  const errors: string[] = [];
  const offline = process.env.LLM_OFFLINE === 'true';
  
  if (offline) {
    return { ok: true, offline: true };
  }
  
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  
  if (!hasOpenAI && !hasAnthropic) {
    errors.push('No LLM API keys configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }
  
  if (provider && !['openai', 'anthropic'].includes(provider)) {
    errors.push(`Invalid LLM_PROVIDER: ${provider}. Must be 'openai' or 'anthropic'.`);
  }
  
  if (provider === 'openai' && !hasOpenAI) {
    errors.push('LLM_PROVIDER set to openai but OPENAI_API_KEY not configured.');
  }
  
  if (provider === 'anthropic' && !hasAnthropic) {
    errors.push('LLM_PROVIDER set to anthropic but ANTHROPIC_API_KEY not configured.');
  }
  
  return {
    ok: errors.length === 0,
    provider: provider || (hasOpenAI ? 'openai' : hasAnthropic ? 'anthropic' : undefined),
    offline: false,
    errors: errors.length > 0 ? errors : undefined
  };
}