import { prisma } from '@/server/db/client';

/**
 * Database client exports for health checks and general use
 * Re-exports the Prisma client for consistent imports
 */

export { prisma };

/**
 * Database health check
 */
export async function checkDatabaseHealth() {
  try {
    // Simple query to check database connection
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: Date.now() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now() 
    };
  }
}

/**
 * Database connection info
 */
export async function getDatabaseInfo() {
  try {
    const info = await prisma.$executeRaw`PRAGMA database_list`;
    return {
      status: 'connected',
      info,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    };
  }
}