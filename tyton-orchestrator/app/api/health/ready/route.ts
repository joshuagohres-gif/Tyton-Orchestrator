import { NextRequest, NextResponse } from 'next/server';
import { getHealthChecker } from '@/server/monitoring/health';
import { prisma } from '@/lib/db';

/**
 * GET /api/health/ready
 * Kubernetes readiness probe endpoint
 * Returns 200 if the service is ready to accept traffic, 503 if not
 */
export async function GET(request: NextRequest) {
  try {
    const healthChecker = getHealthChecker(prisma);
    const result = await healthChecker.readiness();
    
    if (result.ready) {
      return NextResponse.json(result, { status: 200 });
    } else {
      return NextResponse.json(result, { status: 503 });
    }
  } catch (error) {
    return NextResponse.json(
      { ready: false, checks: ['unknown'] },
      { status: 503 }
    );
  }
}