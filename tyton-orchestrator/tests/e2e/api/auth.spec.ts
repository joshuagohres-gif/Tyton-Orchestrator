import { test, expect } from '@playwright/test';

test.describe('Authentication API', () => {
  const testUser = {
    email: 'test@playwright.com',
    password: 'SecureTest123!'
  };

  test.beforeEach(async ({ request }) => {
    // Clean up any existing test user
    await request.delete(`/auth/cleanup?email=${testUser.email}`).catch(() => {
      // Ignore errors - user might not exist
    });
  });

  test('should register a new user', async ({ request }) => {
    const response = await request.post('/auth/register', {
      data: testUser
    });

    expect(response.status()).toBe(201);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: true,
      user: expect.objectContaining({
        id: expect.any(String),
        email: testUser.email
      })
    }));
  });

  test('should not register duplicate email', async ({ request }) => {
    // First registration
    await request.post('/auth/register', { data: testUser });
    
    // Second registration with same email
    const response = await request.post('/auth/register', {
      data: testUser
    });

    expect(response.status()).toBe(409);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('already exists')
    }));
  });

  test('should validate email format', async ({ request }) => {
    const response = await request.post('/auth/register', {
      data: {
        email: 'invalid-email',
        password: testUser.password
      }
    });

    expect(response.status()).toBe(400);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('email')
    }));
  });

  test('should validate password strength', async ({ request }) => {
    const response = await request.post('/auth/register', {
      data: {
        email: testUser.email,
        password: 'weak'
      }
    });

    expect(response.status()).toBe(400);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('password')
    }));
  });

  test('should login with valid credentials', async ({ request }) => {
    // Register user first
    await request.post('/auth/register', { data: testUser });
    
    // Login
    const response = await request.post('/auth/login', {
      data: testUser
    });

    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: true,
      token: expect.any(String),
      user: expect.objectContaining({
        email: testUser.email
      })
    }));

    // Verify JWT token format
    const tokenParts = body.token.split('.');
    expect(tokenParts).toHaveLength(3);
  });

  test('should reject invalid login credentials', async ({ request }) => {
    const response = await request.post('/auth/login', {
      data: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword'
      }
    });

    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Invalid')
    }));
  });

  test('should protect routes with authentication', async ({ request }) => {
    // Try to access protected route without token
    const response = await request.get('/auth/me');

    expect(response.status()).toBe(401);
  });

  test('should allow access with valid token', async ({ request }) => {
    // Register and login to get token
    await request.post('/auth/register', { data: testUser });
    const loginResponse = await request.post('/auth/login', { data: testUser });
    const loginBody = await loginResponse.json();
    const token = loginBody.token;

    // Access protected route with token
    const response = await request.get('/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      user: expect.objectContaining({
        email: testUser.email
      })
    }));
  });

  test('should handle token expiration', async ({ request }) => {
    // This would test with an expired token
    // For now, test with malformed token
    const response = await request.get('/auth/me', {
      headers: {
        'Authorization': 'Bearer invalid.token.here'
      }
    });

    expect(response.status()).toBe(401);
  });

  test('should logout successfully', async ({ request }) => {
    // Register and login
    await request.post('/auth/register', { data: testUser });
    const loginResponse = await request.post('/auth/login', { data: testUser });
    const loginBody = await loginResponse.json();
    const token = loginBody.token;

    // Logout
    const response = await request.post('/auth/logout', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: true,
      message: expect.stringContaining('logged out')
    }));
  });

  test('should rate limit authentication attempts', async ({ request }) => {
    // Make multiple failed login attempts
    const attempts = [];
    for (let i = 0; i < 10; i++) {
      attempts.push(
        request.post('/auth/login', {
          data: {
            email: 'test@example.com',
            password: 'wrongpassword'
          }
        })
      );
    }

    const responses = await Promise.all(attempts);
    
    // At least one should be rate limited (429)
    const rateLimited = responses.some(r => r.status() === 429);
    expect(rateLimited).toBe(true);
  });
});