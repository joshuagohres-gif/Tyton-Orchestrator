// /app/api/projects/[id]/schematic/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runCircuitStage } from "@/server/orchestrator/circuitStage";

const BodyZ = z.object({
  projectContext: z.string().min(1),
  selectedComponentsJson: z.any().optional(),
  pinMapJson: z.any().optional(),
  powerConstraints: z.any().optional(),
  safetyComplianceNotes: z.any().optional(),
});

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const body = BodyZ.parse(await req.json());
    const res = await runCircuitStage(ctx.params.id, body);
    
    if (!res.ok) {
      return NextResponse.json({ 
        ok: false, 
        error: res.error || "Circuit stage failed", 
        errors: res.errors,
        warnings: res.warnings 
      }, { status: 422 });
    }
    
    return NextResponse.json({ 
      ok: true, 
      spec: res.spec, 
      errors: res.errors, 
      warnings: res.warnings, 
      wiringModuleId: res.wiringModuleId, 
      schematicModuleId: res.schematicModuleId 
    });
  } catch (e: any) {
    console.error('Schematic generation error:', e);
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || "UNKNOWN_ERROR" 
    }, { status: 500 });
  }
}