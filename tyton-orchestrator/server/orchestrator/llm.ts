import { expBackoff, jitter, sleep } from "./backoff";
import { classifyLlmError, getRetryDelay, isRetryableError, OrchestratorError } from "./errors";

export interface LlmRetryOptions {
  maxAttempts?: number;
  onAttempt?: (attempt: number, error?: any) => void;
  onRetry?: (attempt: number, error: any, delay: number) => void;
}

/**
 * Call LLM function with intelligent retry logic
 */
export async function callLlmWithRetry<T>(
  fn: () => Promise<T>,
  opts: LlmRetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  let lastError: any;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      opts.onAttempt?.(attempt);
      return await fn();
    } catch (e: any) {
      lastError = e;
      const kind = classifyLlmError(e);
      
      opts.onAttempt?.(attempt, e);

      // Don't retry on last attempt
      if (attempt === maxAttempts - 1) {
        throw new OrchestratorError(
          `LLM call failed after ${maxAttempts} attempts: ${e.message}`,
          `LLM_RETRY_EXHAUSTED_${kind.toUpperCase()}`,
          false,
          { originalError: e, attempts: maxAttempts, errorKind: kind }
        );
      }

      // Don't retry non-retryable errors immediately
      if (!isRetryableError(kind)) {
        // Allow one quick retry for validation errors (might be transient)
        if (kind === "validation" && attempt === 0) {
          await sleep(100);
          continue;
        }
        
        throw new OrchestratorError(
          `Non-retryable LLM error: ${e.message}`,
          `LLM_${kind.toUpperCase()}_ERROR`,
          false,
          { originalError: e, errorKind: kind }
        );
      }

      // Calculate delay based on error type
      const baseDelay = getRetryDelay(kind, attempt);
      const delay = jitter(baseDelay);

      opts.onRetry?.(attempt, e, delay);
      console.warn(`LLM call attempt ${attempt + 1} failed (${kind}), retrying in ${delay}ms:`, e.message);

      await sleep(delay);
    }
  }

  // Should never reach here due to throw in loop
  throw lastError;
}

/**
 * Validate LLM response structure
 */
export function validateLlmResponse<T>(
  response: any,
  validator: (data: any) => T,
  context: string
): T {
  try {
    return validator(response);
  } catch (e) {
    throw new OrchestratorError(
      `LLM response validation failed for ${context}: ${e}`,
      "LLM_VALIDATION_ERROR",
      true, // Validation errors are retryable
      { originalError: e, response, context }
    );
  }
}

/**
 * Wrapper for prompting LLMs with structured validation
 */
export async function promptLlmWithValidation<T>(
  promptFn: () => Promise<string>,
  parser: (content: string) => T,
  context: string,
  opts?: LlmRetryOptions
): Promise<T> {
  return callLlmWithRetry(async () => {
    const content = await promptFn();
    return validateLlmResponse(content, parser, context);
  }, opts);
}