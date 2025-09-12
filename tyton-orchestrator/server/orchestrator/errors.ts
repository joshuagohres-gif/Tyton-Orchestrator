import { match } from "ts-pattern";

export type LlmErrorKind = 
  | "rate_limit" 
  | "timeout" 
  | "network" 
  | "validation" 
  | "server" 
  | "unknown";

/**
 * Classify LLM errors for intelligent retry strategies
 */
export function classifyLlmError(e: any): LlmErrorKind {
  const msg = (e?.message || "").toLowerCase();
  const code = e?.code || "";
  const status = e?.status || e?.response?.status;

  return match({ msg, code, status })
    .when(
      ({ msg }) => msg.includes("rate") || msg.includes("429"),
      () => "rate_limit" as const
    )
    .when(
      ({ status }) => status === 429,
      () => "rate_limit" as const
    )
    .when(
      ({ msg }) => msg.includes("timeout") || msg.includes("timed out"),
      () => "timeout" as const
    )
    .when(
      ({ code }) => code === "ETIMEDOUT" || code === "ECONNABORTED",
      () => "timeout" as const
    )
    .when(
      ({ msg }) => msg.includes("network") || msg.includes("enotfound") || msg.includes("econnrefused"),
      () => "network" as const
    )
    .when(
      ({ code }) => code === "ENOTFOUND" || code === "ECONNREFUSED",
      () => "network" as const
    )
    .when(
      ({ msg }) => msg.includes("schema") || msg.includes("parse") || msg.includes("invalid") || msg.includes("validation"),
      () => "validation" as const
    )
    .when(
      ({ status }) => status >= 500 && status < 600,
      () => "server" as const
    )
    .when(
      ({ msg }) => msg.includes("500") || msg.includes("502") || msg.includes("503"),
      () => "server" as const
    )
    .otherwise(() => "unknown");
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(kind: LlmErrorKind): boolean {
  return match(kind)
    .with("rate_limit", "timeout", "network", "server", () => true)
    .with("validation", "unknown", () => false)
    .exhaustive();
}

/**
 * Get retry delay based on error type
 */
export function getRetryDelay(kind: LlmErrorKind, attempt: number): number {
  return match(kind)
    .with("rate_limit", () => Math.min(30000, 1000 * Math.pow(2, attempt))) // Aggressive backoff for rate limits
    .with("timeout", () => Math.min(10000, 500 * Math.pow(2, attempt)))
    .with("network", () => Math.min(5000, 250 * Math.pow(2, attempt)))
    .with("server", () => Math.min(15000, 750 * Math.pow(2, attempt)))
    .with("validation", () => 100) // Quick retry for validation errors (might be transient)
    .with("unknown", () => 1000)
    .exhaustive();
}

export class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public details?: any
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}