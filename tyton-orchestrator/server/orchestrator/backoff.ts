/**
 * Add jitter to a value to prevent thundering herd
 */
export const jitter = (n: number) => Math.round(n * (0.8 + Math.random() * 0.4));

/**
 * Calculate exponential backoff delay
 */
export function expBackoff(attempt: number, baseMs = 800, capMs = 10000): number {
  return Math.min(capMs, Math.round(baseMs * Math.pow(2, attempt)));
}

/**
 * Sleep for specified milliseconds
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));