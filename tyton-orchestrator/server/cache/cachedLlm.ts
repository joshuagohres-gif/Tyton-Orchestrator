import { getRedisCache } from './redis';
import { getOpenAIService } from '../llm/openai';
import { getAnthropicService } from '../llm/anthropic';

export interface CachedLlmOptions {
  enableCache?: boolean;
  ttl?: number; // Cache TTL in seconds
  model?: string;
  temperature?: number;
  bypassCache?: boolean; // Force fresh API call
}

export interface LlmResponse {
  text: string;
  model: string;
  temperature: number;
  cached: boolean;
  timestamp: number;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

class CachedLlmService {
  private cache = getRedisCache();
  private openaiService: any;
  private anthropicService: any;
  
  constructor() {
    try {
      this.openaiService = getOpenAIService();
    } catch (error) {
      console.warn('OpenAI service not available:', error.message);
    }
    
    try {
      this.anthropicService = getAnthropicService();
    } catch (error) {
      console.warn('Anthropic service not available:', error.message);
    }
  }

  /**
   * Get LLM completion with caching
   */
  async complete(
    prompt: string, 
    options: CachedLlmOptions = {}
  ): Promise<LlmResponse> {
    const {
      enableCache = true,
      ttl = 6 * 60 * 60, // 6 hours default
      model = process.env.MODEL_OPENAI || 'gpt-4o',
      temperature = 0.7,
      bypassCache = false
    } = options;

    // Generate cache key
    const cacheKey = this.cache.generateLLMKey(prompt, model, temperature);
    
    // Try cache first (unless bypassed)
    if (enableCache && !bypassCache) {
      const cached = await this.cache.get<LlmResponse>(cacheKey);
      if (cached) {
        console.log(`[CACHE] LLM cache hit for key: ${cacheKey.substring(0, 16)}...`);
        return {
          ...cached,
          cached: true,
          timestamp: Date.now()
        };
      }
    }

    console.log(`[CACHE] LLM cache miss, calling ${model}...`);
    
    // Determine which service to use
    const service = this.getService(model);
    if (!service) {
      throw new Error(`No LLM service available for model: ${model}`);
    }

    // Call the actual LLM service
    const startTime = Date.now();
    let response: any;
    
    try {
      if (model.startsWith('gpt-') || model.startsWith('o1-')) {
        // OpenAI
        response = await service.complete(prompt, { 
          model, 
          temperature,
          max_tokens: parseInt(process.env.ORCHESTRATION_MAX_TOKENS || '4000')
        });
      } else if (model.startsWith('claude-')) {
        // Anthropic
        response = await service.complete(prompt, { 
          model, 
          temperature,
          max_tokens: parseInt(process.env.ORCHESTRATION_MAX_TOKENS || '4000')
        });
      } else {
        throw new Error(`Unsupported model: ${model}`);
      }
    } catch (error) {
      console.error(`[CACHE] LLM API call failed for ${model}:`, error);
      throw error;
    }

    const duration = Date.now() - startTime;
    console.log(`[CACHE] LLM API call completed in ${duration}ms`);

    // Format response
    const llmResponse: LlmResponse = {
      text: response.text || response.content || '',
      model,
      temperature,
      cached: false,
      timestamp: Date.now(),
      tokenUsage: response.usage || response.tokenUsage
    };

    // Cache the response (fire and forget)
    if (enableCache && llmResponse.text) {
      this.cache.set(cacheKey, llmResponse, { ttl, prefix: 'llm' })
        .catch(err => console.error('[CACHE] Failed to cache LLM response:', err));
    }

    return llmResponse;
  }

  /**
   * Get structured LLM response with JSON parsing and caching
   */
  async completeStructured<T = any>(
    prompt: string,
    schema?: any,
    options: CachedLlmOptions = {}
  ): Promise<{ data: T; response: LlmResponse }> {
    const response = await this.complete(prompt, options);
    
    try {
      // Try to parse JSON from the response
      let jsonText = response.text;
      
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
      
      const data = JSON.parse(jsonText);
      
      // Basic schema validation if provided
      if (schema && typeof schema.parse === 'function') {
        const validated = schema.parse(data);
        return { data: validated, response };
      }
      
      return { data, response };
    } catch (error) {
      throw new Error(`Failed to parse LLM response as JSON: ${error.message}\nResponse: ${response.text}`);
    }
  }

  /**
   * Batch complete multiple prompts with caching
   */
  async completeBatch(
    prompts: string[],
    options: CachedLlmOptions = {}
  ): Promise<LlmResponse[]> {
    // Process prompts concurrently with p-limit to avoid overwhelming the API
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(3); // Max 3 concurrent LLM calls
    
    const promises = prompts.map(prompt => 
      limit(() => this.complete(prompt, options))
    );
    
    return Promise.all(promises);
  }

  /**
   * Clear LLM cache entries
   */
  async clearCache(pattern?: string): Promise<number> {
    if (pattern) {
      return this.cache.deletePattern(`llm:*${pattern}*`);
    }
    return this.cache.clearPrefix('llm');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Warm cache with common prompts
   */
  async warmCache(commonPrompts: Array<{ prompt: string; model?: string }>): Promise<void> {
    console.log(`[CACHE] Warming cache with ${commonPrompts.length} prompts...`);
    
    const promises = commonPrompts.map(({ prompt, model }) =>
      this.complete(prompt, { model, enableCache: true })
        .catch(err => console.error(`[CACHE] Failed to warm cache for prompt:`, err))
    );
    
    await Promise.allSettled(promises);
    console.log('[CACHE] Cache warming completed');
  }

  /**
   * Get cache hit rate and performance metrics
   */
  async getMetrics(): Promise<{
    cacheStats: any;
    redisInfo: any;
    recommendations: string[];
  }> {
    const cacheStats = this.getCacheStats();
    const redisInfo = await this.cache.getInfo();
    
    const recommendations = [];
    
    // Analyze hit rate
    if (cacheStats.hitRate < 0.3) {
      recommendations.push('Low cache hit rate - consider increasing TTL or reviewing cache key strategy');
    } else if (cacheStats.hitRate > 0.8) {
      recommendations.push('Excellent cache hit rate - good cache performance');
    }
    
    // Check error rate
    if (cacheStats.errors > cacheStats.hits * 0.1) {
      recommendations.push('High cache error rate - check Redis connectivity');
    }
    
    // Memory recommendations
    if (redisInfo?.keyCount > 100000) {
      recommendations.push('High key count - consider implementing cache cleanup strategy');
    }
    
    return {
      cacheStats,
      redisInfo,
      recommendations
    };
  }

  private getService(model: string) {
    if (model.startsWith('gpt-') || model.startsWith('o1-')) {
      return this.openaiService;
    } else if (model.startsWith('claude-')) {
      return this.anthropicService;
    }
    
    // Default to OpenAI if available
    return this.openaiService || this.anthropicService;
  }

  /**
   * Check if cache is available
   */
  isCacheAvailable(): boolean {
    return this.cache.isConnected();
  }
}

// Singleton instance
let cachedLlmService: CachedLlmService | null = null;

export function getCachedLlmService(): CachedLlmService {
  if (!cachedLlmService) {
    cachedLlmService = new CachedLlmService();
  }
  return cachedLlmService;
}

export default CachedLlmService;