import { NextRequest, NextResponse } from 'next/server';
import { getMetrics } from '@/server/monitoring/metrics';

/**
 * GET /api/metrics
 * Prometheus-compatible metrics endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const metrics = getMetrics();
    const prometheusFormat = metrics.toPrometheus();
    
    // Return in Prometheus text format
    return new NextResponse(prometheusFormat, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to collect metrics' },
      { status: 500 }
    );
  }
}