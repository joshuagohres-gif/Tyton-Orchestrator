import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const authFailureRate = new Rate('auth_failures');
const apiResponseTime = new Trend('api_response_time');
const databaseErrors = new Counter('database_errors');
const llmRequests = new Counter('llm_requests');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 }, // Ramp up to 10 users over 2 minutes
    { duration: '5m', target: 10 }, // Stay at 10 users for 5 minutes
    { duration: '2m', target: 50 }, // Ramp up to 50 users over 2 minutes
    { duration: '10m', target: 50 }, // Stay at 50 users for 10 minutes
    { duration: '2m', target: 100 }, // Ramp up to 100 users over 2 minutes
    { duration: '5m', target: 100 }, // Stay at 100 users for 5 minutes
    { duration: '3m', target: 0 }, // Ramp down to 0 users over 3 minutes
  ],
  
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'], // Error rate must be below 5%
    auth_failures: ['rate<0.01'], // Auth failure rate must be below 1%
    api_response_time: ['p(90)<1000'], // 90% of API responses under 1s
    database_errors: ['count<10'], // Less than 10 database errors total
  },
  
  // Test metadata
  ext: {
    loadimpact: {
      name: 'Tyton Orchestrator Load Test',
      distribution: {
        'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 }
      }
    }
  }
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

const testUsers = [
  { email: 'loadtest1@example.com', password: 'LoadTest123!' },
  { email: 'loadtest2@example.com', password: 'LoadTest123!' },
  { email: 'loadtest3@example.com', password: 'LoadTest123!' },
  { email: 'loadtest4@example.com', password: 'LoadTest123!' },
  { email: 'loadtest5@example.com', password: 'LoadTest123!' }
];

let authToken = '';

export function setup() {
  console.log('🚀 Setting up load test environment...');
  
  // Health check before starting
  const healthResponse = http.get(`${API_BASE}/health`);
  if (healthResponse.status !== 200) {
    console.error('❌ Application not healthy, aborting test');
    return null;
  }
  
  // Register test users
  testUsers.forEach((user, index) => {
    const response = http.post(`${API_BASE}/auth/register`, JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.status === 201 || response.status === 409) {
      console.log(`✅ Test user ${index + 1} ready`);
    } else {
      console.warn(`⚠️  Failed to register test user ${index + 1}: ${response.status}`);
    }
  });
  
  console.log('✅ Load test setup completed');
  return { users: testUsers };
}

export default function(data) {
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  
  // Authentication flow (20% of the time)
  if (Math.random() < 0.2) {
    testAuthentication(user);
  }
  
  // API operations (80% of the time)
  if (authToken || Math.random() < 0.1) {
    testAPIOperations();
  }
  
  // Database operations (30% of the time)
  if (Math.random() < 0.3) {
    testDatabaseOperations();
  }
  
  // LLM operations (10% of the time - expensive)
  if (Math.random() < 0.1) {
    testLLMOperations();
  }
  
  sleep(Math.random() * 3 + 1); // Random sleep between 1-4 seconds
}

function testAuthentication(user) {
  const loginStart = Date.now();
  
  const loginResponse = http.post(`${API_BASE}/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' }
  });
  
  const loginSuccess = check(loginResponse, {
    'login status is 200': (r) => r.status === 200,
    'login response time < 1000ms': (r) => r.timings.duration < 1000,
    'login returns token': (r) => r.json().token !== undefined
  });
  
  if (!loginSuccess) {
    authFailureRate.add(1);
  } else {
    authFailureRate.add(0);
    authToken = loginResponse.json().token;
  }
  
  apiResponseTime.add(Date.now() - loginStart);
}

function testAPIOperations() {
  const headers = authToken ? {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  } : {
    'Content-Type': 'application/json'
  };
  
  // Test various API endpoints
  const endpoints = [
    { method: 'GET', url: `${API_BASE}/health` },
    { method: 'GET', url: `${API_BASE}/health/database` },
    { method: 'GET', url: `${API_BASE}/health/llm` },
    { method: 'GET', url: `${API_BASE}/projects` },
    { method: 'GET', url: `${API_BASE}/components` }
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const startTime = Date.now();
  
  let response;
  if (endpoint.method === 'GET') {
    response = http.get(endpoint.url, { headers });
  } else {
    response = http.post(endpoint.url, '{}', { headers });
  }
  
  check(response, {
    'API status is success': (r) => r.status >= 200 && r.status < 300,
    'API response time acceptable': (r) => r.timings.duration < 2000,
    'API response has content': (r) => r.body.length > 0
  });
  
  apiResponseTime.add(Date.now() - startTime);
}

function testDatabaseOperations() {
  const headers = authToken ? {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  } : {};
  
  // Test database-heavy endpoints
  const dbEndpoints = [
    `${API_BASE}/projects`,
    `${API_BASE}/components/search?q=resistor`,
    `${API_BASE}/health/database`
  ];
  
  const endpoint = dbEndpoints[Math.floor(Math.random() * dbEndpoints.length)];
  const response = http.get(endpoint, { headers });
  
  const dbSuccess = check(response, {
    'DB operation successful': (r) => r.status >= 200 && r.status < 300,
    'DB response time < 3000ms': (r) => r.timings.duration < 3000,
    'No database errors': (r) => !r.body.includes('database error')
  });
  
  if (!dbSuccess && response.status >= 500) {
    databaseErrors.add(1);
  }
}

function testLLMOperations() {
  if (!authToken) return;
  
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };
  
  // Test LLM endpoints (these are expensive, so we limit them)
  const llmPayload = {
    prompt: 'Generate a simple LED circuit schematic',
    model: 'gpt-4o-mini',
    maxTokens: 100
  };
  
  const response = http.post(`${API_BASE}/llm/complete`, JSON.stringify(llmPayload), { headers });
  
  const llmSuccess = check(response, {
    'LLM operation successful': (r) => r.status >= 200 && r.status < 300,
    'LLM response time < 10000ms': (r) => r.timings.duration < 10000,
    'LLM returns content': (r) => r.json().result !== undefined
  });
  
  llmRequests.add(1);
  
  if (llmSuccess) {
    console.log('✅ LLM operation completed successfully');
  }
}

export function teardown(data) {
  console.log('🧹 Cleaning up load test environment...');
  
  // Clean up test data
  testUsers.forEach((user, index) => {
    const response = http.del(`${API_BASE}/auth/cleanup?email=${user.email}`);
    if (response.status === 200) {
      console.log(`✅ Cleaned up test user ${index + 1}`);
    }
  });
  
  console.log('✅ Load test cleanup completed');
}

// Utility functions for reporting
export function handleSummary(data) {
  console.log('📊 Load Test Results Summary:');
  console.log(`Total requests: ${data.metrics.http_reqs.count}`);
  console.log(`Failed requests: ${data.metrics.http_req_failed.rate * 100}%`);
  console.log(`Average response time: ${data.metrics.http_req_duration.avg}ms`);
  console.log(`95th percentile response time: ${data.metrics.http_req_duration['p(95)']}ms`);
  console.log(`Auth failure rate: ${data.metrics.auth_failures ? data.metrics.auth_failures.rate * 100 : 0}%`);
  console.log(`Database errors: ${data.metrics.database_errors ? data.metrics.database_errors.count : 0}`);
  console.log(`LLM requests: ${data.metrics.llm_requests ? data.metrics.llm_requests.count : 0}`);
  
  return {
    'load-test-summary.json': JSON.stringify(data, null, 2),
  };
}