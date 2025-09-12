// /app/api/projects/[id]/elk/route.ts - Simplified path structure
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSchematicSpec } from "@/server/validation/schematicSpecValidator";
import { specToElk } from "@/server/services/specToElk";
import { computeElkLayout } from "@/server/services/elk";
import { gridLayout, dagreLayout } from "@/server/services/fallbackLayout";

const BodyZ = z.object({
  spec: z.any(),
  layoutOptions: z.record(z.string()).optional(),
  fallbackMode: z.enum(['elk', 'dagre', 'grid']).default('elk')
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const startTime = Date.now();
  console.log(`[API] ELK layout request for project ${params.id}`);
  
  try {
    const body = BodyZ.parse(await req.json());
    console.log(`[API] Layout mode: ${body.fallbackMode}`);
    
    // Validate the schematic spec
    const { ok, errors, warnings, parsed } = validateSchematicSpec(body.spec);
    if (!ok) {
      console.error('[API] Spec validation failed:', errors);
      return NextResponse.json({ ok: false, errors, warnings }, { status: 422 });
    }

    console.log('[API] Spec validation successful');
    
    // Convert to ELK graph
    const elkGraph = specToElk(parsed!);
    if (body.layoutOptions) {
      elkGraph.layoutOptions = { ...(elkGraph.layoutOptions || {}), ...body.layoutOptions };
    }

    let layout;
    
    try {
      if (body.fallbackMode === 'elk') {
        console.log('[API] Attempting ELK layout');
        layout = await computeElkLayout(elkGraph);
      } else if (body.fallbackMode === 'dagre') {
        console.log('[API] Using Dagre fallback');
        layout = await dagreLayout(elkGraph);
      } else {
        console.log('[API] Using grid fallback');
        layout = gridLayout(elkGraph);
      }
    } catch (elkError) {
      console.warn('[API] ELK layout failed, trying Dagre fallback:', elkError);
      try {
        layout = await dagreLayout(elkGraph);
      } catch (dagreError) {
        console.warn('[API] Dagre layout failed, using grid fallback:', dagreError);
        layout = gridLayout(elkGraph);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[API] Layout completed in ${duration}ms`);
    
    return NextResponse.json({ 
      ok: true, 
      layout, 
      warnings,
      meta: {
        duration,
        nodeCount: elkGraph.children.length,
        edgeCount: elkGraph.edges.length,
        layoutEngine: body.fallbackMode
      }
    });
    
  } catch (e: any) {
    const duration = Date.now() - startTime;
    console.error(`[API] Layout error after ${duration}ms:`, e);
    
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || "ELK_LAYOUT_ERROR",
      meta: {
        duration,
        layoutEngine: 'failed'
      }
    }, { status: 500 });
  }
}