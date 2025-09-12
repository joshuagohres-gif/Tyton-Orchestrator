import { vi } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LLM_OFFLINE = 'true';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
  
  // Mock console.log in tests to reduce noise
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks();
  vi.clearAllTimers();
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});

afterAll(() => {
  // Global cleanup
  vi.restoreAllMocks();
});

// Custom matchers and utilities
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid UUID`,
      pass
    };
  },
  
  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    
    return {
      message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid email`,
      pass
    };
  },
  
  toHaveValidTimestamp(received: any, field: string = 'createdAt') {
    const timestamp = received[field];
    const pass = timestamp instanceof Date || (typeof timestamp === 'string' && !isNaN(Date.parse(timestamp)));
    
    return {
      message: () => `expected ${field} ${pass ? 'not ' : ''}to be a valid timestamp`,
      pass
    };
  }
});

// Global test utilities
global.testUtils = {
  // Helper to create mock user
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    roles: '["user"]',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  // Helper to create mock project
  createMockProject: (overrides = {}) => ({
    id: 'test-project-id',
    title: 'Test Project',
    description: 'A test project',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  // Helper to create mock LLM usage
  createMockLlmUsage: (overrides = {}) => ({
    id: 'test-llm-usage-id',
    userId: 'test-user-id',
    model: 'gpt-4o-mini',
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    cost: 0.001,
    cached: false,
    createdAt: new Date(),
    ...overrides
  }),

  // Helper to wait for async operations
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to generate test data
  generateTestId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  // Helper for database cleanup (mock)
  cleanupDatabase: vi.fn(),

  // Helper for Redis cleanup (mock)
  cleanupRedis: vi.fn()
};

// Type declarations for global utilities
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeValidUUID(): T;
      toBeValidEmail(): T;
      toHaveValidTimestamp(field?: string): T;
    }
  }

  var testUtils: {
    createMockUser: (overrides?: any) => any;
    createMockProject: (overrides?: any) => any;
    createMockLlmUsage: (overrides?: any) => any;
    waitFor: (ms: number) => Promise<void>;
    generateTestId: () => string;
    cleanupDatabase: any;
    cleanupRedis: any;
  };
}

export {};