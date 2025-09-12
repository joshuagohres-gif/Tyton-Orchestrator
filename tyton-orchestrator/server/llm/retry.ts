// /server/llm/retry.ts
import pino from "pino";
import { classifyLlmError } from "./errors";

const logger = pino().child({ service: 'llm-retry' });

interface RetryOptions {
  max?: number;
  baseMs?: number;
  capMs?: number;
  classify?: (e: any) => string;
}

export async function withRetry<T>(
  fn: () => Promise<T>, 
  opts: RetryOptions = {}
): Promise<T> {
  const max = opts.max ?? 5;
  const base = opts.baseMs ?? 800;
  const cap = opts.capMs ?? 10000;
  const classify = opts.classify ?? classifyLlmError;
  
  let lastError: any;
  
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        logger.info({ attempt, totalAttempts: max }, 'Retry succeeded');
      }
      return result;
    } catch (e: any) {
      lastError = e;
      const errorType = classify(e);
      
      logger.warn({
        attempt: attempt + 1,
        totalAttempts: max,
        errorType,
        errorMessage: e?.message || 'Unknown error'
      }, 'LLM call attempt failed');
      
      // Classify error types for retry decisions
      const transient = /(rate|timeout|network|server)/i.test(errorType);
      const validation = /(validation|schema|parse|json|invalid)/i.test(errorType);
      
      // Don't retry auth errors
      if (errorType === 'auth') {
        logger.error({ errorType }, 'Authentication error - not retrying');
        throw e;
      }
      
      // Only retry transient errors and validation errors (once)
      if (!transient && !validation) {
        logger.error({ errorType }, 'Non-transient error - not retrying');
        throw e;
      }
      
      // On last attempt, throw the error
      if (attempt === max - 1) {
        logger.error({ 
          attempt: attempt + 1, 
          totalAttempts: max, 
          errorType 
        }, 'All retry attempts exhausted');
        throw e;
      }
      
      // Calculate backoff with jitter
      let backoffMs: number;
      
      if (errorType === 'rate_limit') {
        // Longer backoff for rate limits
        backoffMs = Math.min(cap, base * Math.pow(2, attempt + 1));
      } else if (errorType === 'validation') {
        // Quick retry for validation errors (only retry once)
        backoffMs = attempt === 0 ? 100 : base;
        if (attempt >= 1) {
          logger.warn('Validation error on second attempt - not retrying further');
          throw e;
        }
      } else {
        // Standard exponential backoff for other transient errors
        backoffMs = Math.min(cap, base * Math.pow(2, attempt));
      }
      
      // Add jitter (±20%)
      const jitter = 0.8 + Math.random() * 0.4;
      const delayMs = Math.round(backoffMs * jitter);
      
      logger.info({ 
        attempt: attempt + 1, 
        errorType, 
        delayMs,
        nextAttemptIn: `${delayMs}ms`
      }, `Retrying after delay`);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError || new Error("unreachable");
}