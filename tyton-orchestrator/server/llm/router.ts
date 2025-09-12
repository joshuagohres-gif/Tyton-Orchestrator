// /server/llm/router.ts
import { z } from 'zod';
import pino from 'pino';
import crypto from 'crypto';
import { getOpenAIService } from './openai';
import { getAnthropicService } from './anthropic';
import { withRetry } from './retry';
import { getCachedLlmService } from '../cache/cachedLlm';
import { getServiceCircuitBreakers } from '../resilience/serviceBreakers';
import { getRedisCache } from '../cache/redis';
import { prisma } from '../db/client';

const logger = pino().child({ service: 'llm-router' });

export type LLMProvider = 'openai' | 'anthropic';

export interface RouterOptions {
  provider?: LLMProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  enableRetry?: boolean;
  retryOptions?: {
    max?: number;
    baseMs?: number;
    capMs?: number;
  };
  enableCache?: boolean;
  cacheTtl?: number;
  bypassCache?: boolean;
  // Phase 3 enhancements
  userId?: string; // For cost tracking and budget enforcement
  projectId?: string; // For project-level budgets
  priority?: 'low' | 'medium' | 'high' | 'critical'; // For tiered routing
  enableDeduplication?: boolean; // Inflight request deduplication
  budgetCheck?: boolean; // Enable budget enforcement
}

export interface JSONCompletionOptions {
  system: string;
  user: string;
  schema?: z.ZodTypeAny;
  options?: RouterOptions;
}

interface ModelPricing {
  promptTokenCost: number; // Cost per 1k prompt tokens
  completionTokenCost: number; // Cost per 1k completion tokens
}

interface ModelTier {
  tier: 'economy' | 'balanced' | 'premium';
  maxTokensPerRequest: number;
  costEfficiency: number; // Higher is more cost-efficient
}

interface BatchRequest {
  id: string;
  system: string;
  user: string;
  schema?: z.ZodTypeAny;
  options: RouterOptions;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class LLMRouter {
  private cachedLlm = getCachedLlmService();
  private circuitBreakers = getServiceCircuitBreakers();
  private cache = getRedisCache();
  
  // Phase 3: Request batching
  private batchQueue: BatchRequest[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly batchWindowMs = parseInt(process.env.LLM_BATCH_WINDOW_MS || '100');
  private readonly maxBatchSize = parseInt(process.env.LLM_MAX_BATCH_SIZE || '5');
  
  // Model pricing (USD per 1k tokens) - updated regularly
  private readonly modelPricing: Record<string, ModelPricing> = {
    'gpt-4o': { promptTokenCost: 0.0025, completionTokenCost: 0.01 },
    'gpt-4o-mini': { promptTokenCost: 0.00015, completionTokenCost: 0.0006 },
    'gpt-4-turbo': { promptTokenCost: 0.01, completionTokenCost: 0.03 },
    'gpt-3.5-turbo': { promptTokenCost: 0.0005, completionTokenCost: 0.0015 },
    'claude-3-5-sonnet-20241022': { promptTokenCost: 0.003, completionTokenCost: 0.015 },
    'claude-3-5-haiku-20241022': { promptTokenCost: 0.0008, completionTokenCost: 0.004 },
    'claude-3-opus-20240229': { promptTokenCost: 0.015, completionTokenCost: 0.075 }
  };
  
  // Model tiers for automatic selection
  private readonly modelTiers: Record<string, ModelTier> = {
    'gpt-4o-mini': { tier: 'economy', maxTokensPerRequest: 4000, costEfficiency: 10 },
    'gpt-3.5-turbo': { tier: 'economy', maxTokensPerRequest: 4000, costEfficiency: 8 },
    'claude-3-5-haiku-20241022': { tier: 'economy', maxTokensPerRequest: 4000, costEfficiency: 9 },
    'gpt-4o': { tier: 'balanced', maxTokensPerRequest: 8000, costEfficiency: 7 },
    'claude-3-5-sonnet-20241022': { tier: 'balanced', maxTokensPerRequest: 8000, costEfficiency: 6 },
    'gpt-4-turbo': { tier: 'premium', maxTokensPerRequest: 16000, costEfficiency: 4 },
    'claude-3-opus-20240229': { tier: 'premium', maxTokensPerRequest: 16000, costEfficiency: 3 }
  };

  private getProvider(): LLMProvider {
    const envProvider = process.env.LLM_PROVIDER?.toLowerCase() as LLMProvider;
    if (envProvider === 'anthropic' || envProvider === 'openai') {
      return envProvider;
    }
    
    // Default fallback logic
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
    
    throw new Error('No LLM provider configured. Set LLM_PROVIDER and corresponding API key.');
  }

  private isOfflineMode(): boolean {
    return process.env.LLM_OFFLINE === 'true' || process.env.NODE_ENV === 'test';
  }

  /**
   * Enhanced JSON completion with caching, deduplication, and cost tracking
   */
  async completeJSONCached({
    system,
    user,
    schema,
    options = {}
  }: JSONCompletionOptions): Promise<{result: string; cached: boolean; cost?: number; model?: string}> {
    const {
      enableCache = process.env.CACHE_ENABLED !== 'false',
      cacheTtl = parseInt(process.env.CACHE_LLM_TTL || '21600'),
      bypassCache = false,
      provider,
      model,
      temperature = 0.7,
      userId,
      projectId,
      priority = 'medium',
      enableDeduplication = true,
      budgetCheck = true
    } = options;

    // Phase 3: Budget enforcement
    if (budgetCheck && userId) {
      await this.checkUserBudget(userId, projectId);
    }

    // Phase 3: Tiered model selection
    const selectedModel = model || this.selectOptimalModel(priority, system + '\n' + user);
    const selectedProvider = provider || this.getProviderForModel(selectedModel);

    // Check for offline mode
    if (this.isOfflineMode()) {
      logger.info('LLM offline mode enabled - returning mock response');
      return { result: this.getMockResponse(schema), cached: false };
    }

    // Construct full prompt for caching
    const fullPrompt = `SYSTEM: ${system}\n\nUSER: ${user}`;
    const modelName = selectedModel;
    
    // Phase 3: Inflight request deduplication
    if (enableDeduplication) {
      const deduplicationResult = await this.handleInflightDeduplication(fullPrompt, modelName, temperature, schema);
      if (deduplicationResult) {
        logger.info('Request deduplicated - returning existing result');
        return deduplicationResult;
      }
    }

    try {
      // Use cached LLM service for structured responses with circuit breaker
      const response = await this.circuitBreakers.executeLLMOperation('router', async () => {
        return await this.cachedLlm.completeStructured(
          fullPrompt,
          schema,
          {
            enableCache,
            ttl: cacheTtl,
            bypassCache,
            model: modelName,
            temperature
          }
        );
      });

      // Phase 3: Calculate and track cost
      const cost = this.calculateCost(response.response.tokenUsage, modelName);
      if (userId) {
        await this.trackLLMUsage(userId, projectId, {
          model: modelName,
          promptTokens: response.response.tokenUsage?.prompt || 0,
          completionTokens: response.response.tokenUsage?.completion || 0,
          cost,
          cached: response.response.cached
        });
      }

      logger.debug({
        cached: response.response.cached,
        model: response.response.model,
        temperature: response.response.temperature,
        cost,
        userId
      }, 'LLM completion with caching and circuit protection');

      return {
        result: JSON.stringify(response.data),
        cached: response.response.cached,
        cost,
        model: modelName
      };
    } catch (error) {
      logger.error({ error }, 'Cached LLM completion failed, falling back to direct call');
      
      // Fallback to direct LLM call
      const result = await this.completeJSON({ system, user, schema, options });
      return { result, cached: false, cost: 0, model: modelName };
    }
  }

  async completeJSON({
    system,
    user,
    schema,
    options = {}
  }: JSONCompletionOptions): Promise<string> {
    // Check for offline mode
    if (this.isOfflineMode()) {
      logger.info('LLM offline mode enabled - returning mock response');
      return this.getMockResponse(schema);
    }

    const provider = options.provider || this.getProvider();
    const maxTokens = options.maxTokens || 2000;
    const model = options.model;

    logger.debug({
      provider,
      model,
      maxTokens,
      enableRetry: options.enableRetry !== false
    }, 'Routing LLM request');

    const completionFn = async () => {
      switch (provider) {
        case 'openai': {
          return await this.circuitBreakers.executeLLMOperation('openai', async () => {
            const service = getOpenAIService();
            return await service.completeJSON({
              system,
              user,
              schema,
              maxTokens,
              model: model || process.env.MODEL_OPENAI || 'gpt-4o-mini'
            });
          });
        }
        
        case 'anthropic': {
          return await this.circuitBreakers.executeLLMOperation('anthropic', async () => {
            const service = getAnthropicService();
            if (!service) {
              throw new Error('Anthropic API key not configured');
            }
            return await service.completeJSON({
              system,
              user,
              schema,
              maxTokens,
              model: model || process.env.MODEL_ANTHROPIC || 'claude-3-5-sonnet-20241022'
            });
          });
        }
        
        default:
          throw new Error(`Unsupported LLM provider: ${provider}`);
      }
    };

    // Apply retry logic if enabled (default: true)
    if (options.enableRetry !== false) {
      return await withRetry(completionFn, options.retryOptions);
    } else {
      return await completionFn();
    }
  }

  private getMockResponse(schema?: z.ZodTypeAny): string {
    if (schema) {
      // Generate mock data based on schema if available
      try {
        const mockData = this.generateMockFromSchema(schema);
        return JSON.stringify(mockData);
      } catch (e) {
        logger.warn({ error: e.message }, 'Failed to generate mock from schema');
      }
    }
    
    // Default mock response
    return JSON.stringify({
      success: true,
      message: "Mock response - LLM offline mode enabled",
      timestamp: new Date().toISOString()
    });
  }

  private generateMockFromSchema(schema: z.ZodTypeAny): any {
    try {
      // Special handling for specific schemas
      if (schema === require('./schemas').LLMPatchResponseZ) {
        return {
          patches: [{
            ref: "R1",
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric", 
            confidence: 0.9,
            notes: "Mock component patch"
          }],
          metadata: {
            total_components: 1,
            resolved_count: 1,
            avg_confidence: 0.9
          }
        };
      }
    } catch (e) {
      // Ignore import errors, fall back to generic generation
    }
    
    // Basic mock generation for common Zod types
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const mock: any = {};
      
      for (const [key, fieldSchema] of Object.entries(shape)) {
        mock[key] = this.generateMockFromSchema(fieldSchema as z.ZodTypeAny);
      }
      
      return mock;
    }
    
    if (schema instanceof z.ZodString) {
      return "mock-string";
    }
    
    if (schema instanceof z.ZodNumber) {
      return 42;
    }
    
    if (schema instanceof z.ZodBoolean) {
      return true;
    }
    
    if (schema instanceof z.ZodArray) {
      const itemSchema = schema.element;
      return [this.generateMockFromSchema(itemSchema)];
    }
    
    if (schema instanceof z.ZodEnum) {
      const values = schema.options;
      return values[0]; // Return first enum value
    }
    
    if (schema instanceof z.ZodOptional) {
      return this.generateMockFromSchema(schema.unwrap());
    }
    
    // Fallback for unknown types
    return null;
  }

  /**
   * Phase 3: Inflight request deduplication using Redis locks
   */
  private async handleInflightDeduplication(
    prompt: string,
    model: string,
    temperature: number,
    schema?: z.ZodTypeAny
  ): Promise<{result: string; cached: boolean; cost?: number; model?: string} | null> {
    // Generate deduplication key
    const dedupKey = this.generateDeduplicationKey(prompt, model, temperature);
    const lockKey = `lock:${dedupKey}`;
    const resultKey = `result:${dedupKey}`;
    
    try {
      // Try to acquire lock (setNX with expiration)
      const lockAcquired = await this.cache.getOrSet(
        lockKey,
        async () => Date.now().toString(),
        { ttl: 30, prefix: 'dedup' } // 30 second lock
      );
      
      if (!lockAcquired) {
        // Another request is processing, wait for result
        let attempts = 0;
        while (attempts < 30) { // Max 30 seconds wait
          const result = await this.cache.get(resultKey, { prefix: 'dedup' });
          if (result) {
            logger.info('Deduplication hit - returning inflight result');
            return result;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        }
        // Timeout waiting for inflight request
        return null;
      }
      
      // We acquired the lock, proceed with request
      return null;
      
    } catch (error) {
      logger.error({ error }, 'Deduplication check failed');
      return null;
    }
  }
  
  private generateDeduplicationKey(prompt: string, model: string, temperature: number): string {
    const data = { prompt: prompt.trim(), model, temperature };
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(data, Object.keys(data).sort()))
      .digest('hex')
      .substring(0, 16);
    return `dedup:${hash}`;
  }
  
  /**
   * Phase 3: Tiered model selection based on priority and prompt complexity
   */
  private selectOptimalModel(priority: string, prompt: string): string {
    const promptLength = prompt.length;
    const isComplex = this.assessPromptComplexity(prompt);
    
    if (priority === 'critical' || isComplex) {
      // Use premium models for critical or complex requests
      return process.env.MODEL_ANTHROPIC || 'claude-3-5-sonnet-20241022';
    } else if (priority === 'high') {
      // Use balanced models for high priority
      return process.env.MODEL_OPENAI || 'gpt-4o';
    } else if (priority === 'low' || promptLength < 1000) {
      // Use economy models for low priority or simple requests
      return 'gpt-4o-mini';
    } else {
      // Default balanced model
      return 'gpt-4o';
    }
  }
  
  private assessPromptComplexity(prompt: string): boolean {
    // Simple heuristics for prompt complexity
    const complexityIndicators = [
      'analyze', 'complex', 'detailed', 'comprehensive',
      'multiple steps', 'reasoning', 'logic', 'algorithm',
      'code', 'programming', 'technical', 'engineering'
    ];
    
    const lowerPrompt = prompt.toLowerCase();
    const indicatorCount = complexityIndicators.filter(indicator => 
      lowerPrompt.includes(indicator)
    ).length;
    
    return indicatorCount >= 2 || prompt.length > 5000;
  }
  
  private getProviderForModel(model: string): LLMProvider {
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('gpt-') || model.startsWith('o1-')) return 'openai';
    return 'openai'; // Default
  }
  
  /**
   * Phase 3: Budget enforcement
   */
  private async checkUserBudget(userId: string, projectId?: string): Promise<void> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    try {
      // Check user monthly budget
      const userUsage = await prisma.llmUsage.aggregate({
        where: {
          userId,
          createdAt: { gte: startOfMonth }
        },
        _sum: { cost: true }
      });
      
      const userBudget = parseFloat(process.env.LLM_BUDGET_DEFAULT_USD || '25');
      const userSpent = userUsage._sum.cost || 0;
      
      if (userSpent >= userBudget) {
        throw new Error(`User budget exceeded: $${userSpent.toFixed(4)} >= $${userBudget}`);
      }
      
      // Check project budget if specified
      if (projectId) {
        const projectUsage = await prisma.llmUsage.aggregate({
          where: {
            projectId,
            createdAt: { gte: startOfMonth }
          },
          _sum: { cost: true }
        });
        
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { llmBudget: true }
        });
        
        const projectBudget = project?.llmBudget || userBudget * 2; // Default 2x user budget
        const projectSpent = projectUsage._sum.cost || 0;
        
        if (projectSpent >= projectBudget) {
          throw new Error(`Project budget exceeded: $${projectSpent.toFixed(4)} >= $${projectBudget}`);
        }
      }
      
      logger.debug({ userId, projectId, userSpent, userBudget }, 'Budget check passed');
      
    } catch (error) {
      if (error.message.includes('budget exceeded')) {
        throw error;
      }
      logger.warn({ error, userId, projectId }, 'Budget check failed, allowing request');
    }
  }
  
  /**
   * Phase 3: Cost calculation
   */
  private calculateCost(tokenUsage: any, model: string): number {
    if (!tokenUsage) return 0;
    
    const pricing = this.modelPricing[model];
    if (!pricing) {
      logger.warn({ model }, 'No pricing data for model, using default');
      return 0.001; // Fallback minimal cost
    }
    
    const promptCost = (tokenUsage.prompt || 0) * pricing.promptTokenCost / 1000;
    const completionCost = (tokenUsage.completion || 0) * pricing.completionTokenCost / 1000;
    
    return promptCost + completionCost;
  }
  
  /**
   * Phase 3: Usage tracking
   */
  private async trackLLMUsage(
    userId: string,
    projectId: string | undefined,
    usage: {
      model: string;
      promptTokens: number;
      completionTokens: number;
      cost: number;
      cached: boolean;
    }
  ): Promise<void> {
    try {
      await prisma.llmUsage.create({
        data: {
          userId,
          projectId,
          model: usage.model,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.promptTokens + usage.completionTokens,
          cost: usage.cost,
          cached: usage.cached,
          createdAt: new Date()
        }
      });
      
      logger.debug({
        userId,
        projectId,
        model: usage.model,
        cost: usage.cost,
        cached: usage.cached
      }, 'LLM usage tracked');
      
    } catch (error) {
      logger.error({ error, userId, projectId }, 'Failed to track LLM usage');
    }
  }
  
  /**
   * Phase 3: Request batching - queue requests for batch processing
   */
  async completeJSONBatched({
    system,
    user,
    schema,
    options = {}
  }: JSONCompletionOptions): Promise<{result: string; cached: boolean; cost?: number; model?: string}> {
    return new Promise((resolve, reject) => {
      const batchRequest: BatchRequest = {
        id: crypto.randomUUID(),
        system,
        user,
        schema,
        options,
        resolve,
        reject
      };
      
      this.batchQueue.push(batchRequest);
      
      // Process batch if it's full
      if (this.batchQueue.length >= this.maxBatchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        // Set timer to process batch after window
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, this.batchWindowMs);
      }
    });
  }
  
  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;
    
    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    const batch = [...this.batchQueue];
    this.batchQueue = [];
    
    logger.info({ batchSize: batch.length }, 'Processing LLM batch request');
    
    // Group by model/provider for efficient processing
    const modelGroups = batch.reduce((groups, request) => {
      const model = this.selectOptimalModel(
        request.options.priority || 'medium',
        request.system + '\n' + request.user
      );
      
      if (!groups[model]) {
        groups[model] = [];
      }
      groups[model].push({ ...request, selectedModel: model });
      return groups;
    }, {} as Record<string, any[]>);
    
    // Process each model group
    const processPromises = Object.entries(modelGroups).map(
      async ([model, requests]) => {
        const results = await Promise.allSettled(
          requests.map(req => 
            this.completeJSONCached({
              system: req.system,
              user: req.user,
              schema: req.schema,
              options: { ...req.options, model }
            })
          )
        );
        
        // Resolve/reject individual requests
        results.forEach((result, index) => {
          const request = requests[index];
          if (result.status === 'fulfilled') {
            request.resolve(result.value);
          } else {
            request.reject(result.reason);
          }
        });
      }
    );
    
    await Promise.allSettled(processPromises);
    logger.info({ batchSize: batch.length }, 'Batch processing completed');
  }
  
  /**
   * Get usage statistics for a user or project
   */
  async getUsageStats(userId: string, projectId?: string, days = 30): Promise<{
    totalCost: number;
    totalTokens: number;
    requestCount: number;
    cacheHitRate: number;
    modelBreakdown: Array<{ model: string; cost: number; requests: number }>;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const where = projectId 
      ? { projectId, createdAt: { gte: since } }
      : { userId, createdAt: { gte: since } };
    
    const [usage, modelStats] = await Promise.all([
      prisma.llmUsage.aggregate({
        where,
        _sum: { cost: true, totalTokens: true },
        _count: true,
        _avg: { cached: true }
      }),
      prisma.llmUsage.groupBy({
        where,
        by: ['model'],
        _sum: { cost: true },
        _count: true
      })
    ]);
    
    return {
      totalCost: usage._sum.cost || 0,
      totalTokens: usage._sum.totalTokens || 0,
      requestCount: usage._count,
      cacheHitRate: (usage._avg.cached || 0) * 100,
      modelBreakdown: modelStats.map(stat => ({
        model: stat.model,
        cost: stat._sum.cost || 0,
        requests: stat._count
      }))
    };
  }
  
  async healthCheck(): Promise<{ provider: LLMProvider; status: 'ok' | 'error'; error?: string }> {
    if (this.isOfflineMode()) {
      return { provider: 'offline' as LLMProvider, status: 'ok' };
    }

    const provider = this.getProvider();
    
    try {
      const result = await this.completeJSON({
        system: 'Respond with valid JSON only.',
        user: 'Return {"status": "ok"}',
        options: {
          provider,
          maxTokens: 10,
          enableRetry: false
        }
      });
      
      JSON.parse(result); // Validate JSON
      return { provider, status: 'ok' };
    } catch (error: any) {
      logger.error({ provider, error: error.message }, 'LLM health check failed');
      return { provider, status: 'error', error: error.message };
    }
  }
}

// Singleton instance
const llmRouter = new LLMRouter();

export default llmRouter;
export { llmRouter };