// /server/llm/errors.ts
export function classifyLlmError(e: any): string {
  const m = (e?.message || "").toLowerCase();
  const code = e?.status || e?.code || "";
  
  // Rate limiting
  if (m.includes("429") || m.includes("rate") || code === 429) return "rate_limit";
  
  // Timeouts
  if (m.includes("timeout") || m.includes("aborted") || code === "ETIMEDOUT") return "timeout";
  
  // Network errors
  if (m.includes("network") || m.includes("econn") || m.includes("enotfound") || 
      m.includes("connection") || code === "ECONNRESET") return "network";
      
  // JSON/Schema validation errors
  if (m.includes("schema") || m.includes("parse") || m.includes("invalid") || 
      m.includes("json") || m.includes("syntax")) return "validation";
      
  // Server errors (5xx)
  if (m.includes("500") || m.includes("502") || m.includes("503") || 
      code >= 500 && code < 600) return "server";
      
  // Client errors that are not retriable
  if (m.includes("401") || m.includes("403") || m.includes("unauthorized") ||
      code === 401 || code === 403) return "auth";
      
  return "unknown";
}

export interface RetryableError extends Error {
  isRetryable: boolean;
  errorType: string;
}