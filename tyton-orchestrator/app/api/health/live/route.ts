import { NextRequest, NextResponse } from 'next/server';
import { getHealthChecker } from '@/server/monitoring/health';
import { prisma } from '@/lib/db';

/**
 * GET /api/health/live
 * Kubernetes liveness probe endpoint
 * Returns 200 if the service is alive, 503 if not
 */
export async function GET(request: NextRequest) {
  try {
    const healthChecker = getHealthChecker(prisma);
    const result = await healthChecker.liveness();
    
    if (result.status === 'ok') {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 503 });
    }
  } catch (error) {
    return NextResponse.json(
      { status: 'error', uptime: 0 },
      { status: 503 }
    );
  }
}