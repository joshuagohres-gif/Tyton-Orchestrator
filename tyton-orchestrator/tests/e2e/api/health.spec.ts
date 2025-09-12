import { test, expect } from '@playwright/test';

test.describe('API Health Endpoints', () => {
  test('should return 200 for health check', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      status: expect.any(String),
      timestamp: expect.any(String)
    }));
  });

  test('should return database health status', async ({ request }) => {
    const response = await request.get('/health/database');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      status: expect.oneOf(['healthy', 'unhealthy']),
      message: expect.any(String),
      duration: expect.any(Number)
    }));
  });

  test('should return LLM service health', async ({ request }) => {
    const response = await request.get('/health/llm');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      provider: expect.any(String),
      status: expect.oneOf(['ok', 'error'])
    }));
  });

  test('should return cache health status', async ({ request }) => {
    const response = await request.get('/health/cache');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      connected: expect.any(Boolean),
      stats: expect.any(Object)
    }));
  });

  test('should handle health check timeouts gracefully', async ({ request }) => {
    // This test ensures health checks don't hang
    const startTime = Date.now();
    const response = await request.get('/health');
    const duration = Date.now() - startTime;
    
    expect(response.status()).toBe(200);
    expect(duration).toBeLessThan(5000); // Should respond within 5 seconds
  });
});