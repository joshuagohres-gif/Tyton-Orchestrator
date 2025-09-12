import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/',
        '.next/',
        'prisma/',
        'scripts/',
        '**/*.spec.ts',
        '**/*.test.ts'
      ],
      include: [
        'server/**/*.ts',
        'app/**/*.ts',
        'lib/**/*.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        // Critical components need higher coverage
        'server/llm/': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        },
        'server/db/': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85
        },
        'server/auth/': {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true // Prevent database conflicts
      }
    },
    sequence: {
      concurrent: false // Run tests sequentially for database operations
    },
    // Test file patterns
    include: [
      'tests/**/*.{test,spec}.{js,ts}',
      'server/**/*.{test,spec}.{js,ts}'
    ],
    exclude: [
      'node_modules/',
      '.next/',
      'tests/e2e/',
      'tests/load/'
    ],
    // Mock handling
    deps: {
      inline: ['@prisma/client']
    },
    // Environment variables for testing
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
      REDIS_URL: 'redis://localhost:6379/1',
      JWT_SECRET: 'test-jwt-secret-for-testing-only',
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      LLM_OFFLINE: 'true'
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@/server': path.resolve(__dirname, 'server'),
      '@/app': path.resolve(__dirname, 'app'),
      '@/lib': path.resolve(__dirname, 'lib'),
      '@/tests': path.resolve(__dirname, 'tests')
    }
  }
});