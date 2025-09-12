import { describe, it, expect, beforeEach, vi } from "vitest";
import { callLlmWithRetry } from "@/server/orchestrator/llm";
import { classifyLlmError, getRetryDelay } from "@/server/orchestrator/errors";

describe("LLM Retry Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should succeed on first attempt", async () => {
    const mockFn = vi.fn().mockResolvedValue("success");
    const onAttempt = vi.fn();

    const result = await callLlmWithRetry(mockFn, { onAttempt });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(onAttempt).toHaveBeenCalledWith(0);
  });

  it("should retry on rate limit error", async () => {
    const rateLimitError = new Error("Rate limit exceeded (429)");
    const mockFn = vi.fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue("success");

    const onAttempt = vi.fn();
    const onRetry = vi.fn();

    const result = await callLlmWithRetry(mockFn, { 
      onAttempt, 
      onRetry,
      maxAttempts: 5
    });

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(onAttempt).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("should retry on timeout error", async () => {
    const timeoutError = new Error("Request timeout");
    const mockFn = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValue("success");

    const result = await callLlmWithRetry(mockFn);

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should retry on network error", async () => {
    const networkError = new Error("ENOTFOUND api.openai.com");
    networkError.code = "ENOTFOUND";
    
    const mockFn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue("success");

    const result = await callLlmWithRetry(mockFn);

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should allow one quick retry for validation errors", async () => {
    const validationError = new Error("Invalid JSON schema");
    const mockFn = vi.fn()
      .mockRejectedValueOnce(validationError)
      .mockResolvedValue("success");

    const result = await callLlmWithRetry(mockFn);

    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should fail immediately on second validation error", async () => {
    const validationError = new Error("Invalid JSON schema");
    const mockFn = vi.fn()
      .mockRejectedValueOnce(validationError)
      .mockRejectedValueOnce(validationError);

    await expect(callLlmWithRetry(mockFn)).rejects.toThrow("Non-retryable LLM error");
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should exhaust retries and throw appropriate error", async () => {
    const rateLimitError = new Error("Rate limit exceeded");
    const mockFn = vi.fn().mockRejectedValue(rateLimitError);

    await expect(
      callLlmWithRetry(mockFn, { maxAttempts: 3 })
    ).rejects.toThrow("LLM call failed after 3 attempts");

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("should call onRetry with correct parameters", async () => {
    const error = new Error("Rate limit");
    const mockFn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue("success");

    const onRetry = vi.fn();

    await callLlmWithRetry(mockFn, { onRetry });

    expect(onRetry).toHaveBeenCalledWith(0, error, expect.any(Number));
  });
});

describe("Error Classification", () => {
  it("should classify rate limit errors", () => {
    expect(classifyLlmError(new Error("Rate limit exceeded"))).toBe("rate_limit");
    expect(classifyLlmError(new Error("429 Too Many Requests"))).toBe("rate_limit");
    expect(classifyLlmError({ status: 429 })).toBe("rate_limit");
  });

  it("should classify timeout errors", () => {
    expect(classifyLlmError(new Error("Request timeout"))).toBe("timeout");
    expect(classifyLlmError(new Error("Request timed out"))).toBe("timeout");
    expect(classifyLlmError({ code: "ETIMEDOUT" })).toBe("timeout");
  });

  it("should classify network errors", () => {
    expect(classifyLlmError(new Error("Network error"))).toBe("network");
    expect(classifyLlmError({ code: "ENOTFOUND" })).toBe("network");
    expect(classifyLlmError({ code: "ECONNREFUSED" })).toBe("network");
  });

  it("should classify validation errors", () => {
    expect(classifyLlmError(new Error("Invalid schema"))).toBe("validation");
    expect(classifyLlmError(new Error("JSON parse error"))).toBe("validation");
    expect(classifyLlmError(new Error("Validation failed"))).toBe("validation");
  });

  it("should classify server errors", () => {
    expect(classifyLlmError({ status: 500 })).toBe("server");
    expect(classifyLlmError({ status: 502 })).toBe("server");
    expect(classifyLlmError(new Error("Internal server error 500"))).toBe("server");
  });

  it("should classify unknown errors", () => {
    expect(classifyLlmError(new Error("Something weird happened"))).toBe("unknown");
    expect(classifyLlmError({})).toBe("unknown");
  });
});

describe("Retry Delay Calculation", () => {
  it("should calculate delays for rate limits", () => {
    expect(getRetryDelay("rate_limit", 0)).toBe(1000);
    expect(getRetryDelay("rate_limit", 1)).toBe(2000);
    expect(getRetryDelay("rate_limit", 2)).toBe(4000);
    expect(getRetryDelay("rate_limit", 5)).toBe(30000); // Capped at 30s
  });

  it("should calculate delays for timeouts", () => {
    expect(getRetryDelay("timeout", 0)).toBe(500);
    expect(getRetryDelay("timeout", 1)).toBe(1000);
    expect(getRetryDelay("timeout", 2)).toBe(2000);
    expect(getRetryDelay("timeout", 5)).toBe(10000); // Capped at 10s
  });

  it("should calculate delays for network errors", () => {
    expect(getRetryDelay("network", 0)).toBe(250);
    expect(getRetryDelay("network", 1)).toBe(500);
    expect(getRetryDelay("network", 2)).toBe(1000);
    expect(getRetryDelay("network", 5)).toBe(5000); // Capped at 5s
  });

  it("should have quick retry for validation errors", () => {
    expect(getRetryDelay("validation", 0)).toBe(100);
    expect(getRetryDelay("validation", 1)).toBe(100);
    expect(getRetryDelay("validation", 5)).toBe(100);
  });

  it("should calculate delays for server errors", () => {
    expect(getRetryDelay("server", 0)).toBe(750);
    expect(getRetryDelay("server", 1)).toBe(1500);
    expect(getRetryDelay("server", 2)).toBe(3000);
    expect(getRetryDelay("server", 5)).toBe(15000); // Capped at 15s
  });

  it("should have default delay for unknown errors", () => {
    expect(getRetryDelay("unknown", 0)).toBe(1000);
    expect(getRetryDelay("unknown", 5)).toBe(1000);
  });
});