import { NextRequest, NextResponse } from 'next/server';
import { getHealthChecker } from '@/server/monitoring/health';
import { prisma } from '@/lib/db';
import pino from 'pino';

const logger = pino().child({ service: 'health-api' });

/**
 * GET /api/health
 * Comprehensive health check endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const healthChecker = getHealthChecker(prisma);
    const result = await healthChecker.check();
    
    // Determine HTTP status code based on health
    let statusCode = 200;
    if (result.status === 'unhealthy') {
      statusCode = 503; // Service Unavailable
    } else if (result.status === 'degraded') {
      statusCode = 200; // Still return 200 for degraded to not trigger alerts
    }
    
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    logger.error({ error }, 'Health check endpoint error');
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: Date.now(),
        uptime: 0,
        checks: {},
        error: 'Health check failed'
      },
      { status: 503 }
    );
  }
}