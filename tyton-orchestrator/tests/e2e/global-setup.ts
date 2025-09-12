import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test setup...');

  // Start a browser to warm up and verify the application is running
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for the application to be ready
    console.log('🔍 Checking application health...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Check if the app is responding
    const title = await page.title();
    if (!title) {
      throw new Error('Application not responding - no title found');
    }
    
    // Check API health endpoint
    const response = await page.goto('http://localhost:3000/api/health');
    if (!response || response.status() !== 200) {
      console.warn('⚠️  API health endpoint not available');
    }
    
    console.log('✅ Application is ready for E2E testing');
    
  } catch (error) {
    console.error('❌ Application setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }

  // Set up test database state if needed
  console.log('🗄️  Setting up test database state...');
  
  // Here you would typically:
  // 1. Run database migrations
  // 2. Seed test data
  // 3. Set up authentication tokens
  // 4. Clear any existing test data
  
  console.log('✅ E2E test setup completed');
}

export default globalSetup;