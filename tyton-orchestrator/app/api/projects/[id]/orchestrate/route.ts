import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrchestrationPipeline } from '@/server/orchestrator/pipeline';

// Schema for orchestration request
const orchestrateSchema = z.object({
  mode: z.enum(['meta', 'stage']),
  stage: z.enum(['components', 'wiring', 'mechanical', 'firmware', 'bom', 'sourcing']).optional(),
  overrides: z.record(z.string(), z.any()).optional(),
  safetyGateOverride: z.boolean().optional()
});

// Rate limiting: Simple in-memory store (replace with Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = parseInt(process.env.RATE_LIMIT_REQ_PER_MIN || '60');
  const windowMs = 60 * 1000; // 1 minute
  
  const record = rateLimitStore.get(ip);
  
  if (!record || record.resetTime < now) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }
    
    const body = await request.json();
    
    // Validate input
    const validated = orchestrateSchema.parse(body);
    
    // Temporarily override the safety gate environment variable if requested
    const originalOverride = process.env.SAFETY_GATE_OVERRIDE;
    if (validated.safetyGateOverride) {
      process.env.SAFETY_GATE_OVERRIDE = 'true';
    }
    
    try {
      const pipeline = getOrchestrationPipeline();
      
        if (validated.mode === 'meta') {
          // Run full meta orchestration
          const result = await pipeline.runMeta(params.id);
        
          if (!result.success) {
            return NextResponse.json(
              { error: result.error },
              { status: 500 }
            );
          }
          
          return NextResponse.json({
            success: true,
            data: result.data,
            safetyGate: result.safetyGate
          });
          
        } else if (validated.mode === 'stage' && validated.stage) {
          // Run single stage
          const result = await pipeline.runStage(
            params.id,
            validated.stage,
            validated.overrides || {}
          );
          
          if (!result.success) {
            return NextResponse.json(
              { error: result.error },
              { status: 500 }
            );
          }
          
          return NextResponse.json({
            success: true,
            data: result.data,
            safetyGate: result.safetyGate,
            openQuestions: result.openQuestions
          });
          
        } else {
          return NextResponse.json(
            { error: 'Invalid orchestration request' },
            { status: 400 }
          );
        }
    } finally {
      // Restore original environment variable
      if (originalOverride !== undefined) {
        process.env.SAFETY_GATE_OVERRIDE = originalOverride;
      } else {
        delete process.env.SAFETY_GATE_OVERRIDE;
      }
    }
    
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }
    
    console.error('Orchestration failed:', error);
    return NextResponse.json(
      { error: 'Orchestration failed', message: error.message },
      { status: 500 }
    );
  }
}