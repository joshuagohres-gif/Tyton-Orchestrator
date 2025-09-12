import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { validateSchematicSpec } from "@/server/validation/schematicSpecValidator";
import { runEdaEnrich } from "@/server/orchestrator/edaEnrichStage";
import { z } from "zod";

const prisma = new PrismaClient();

const BodySchema = z.object({
  mech: z.any().optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = BodySchema.parse(await request.json());
    
    console.log(`[EDA_ENRICH_API] Starting EDA enrichment for project ${projectId}`);
    
    // Get project
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }
    
    // Get schematic module
    const schematicModule = await prisma.module.findFirst({
      where: { projectId, kind: "schematic" }
    });
    
    if (!schematicModule?.metadata) {
      return NextResponse.json(
        { error: "No schematic specification found. Please generate schematic first." },
        { status: 422 }
      );
    }
    
    // Parse and validate schematic spec
    const schematicMetadata = JSON.parse(schematicModule.metadata as string);
    const schematicValidation = validateSchematicSpec(schematicMetadata.schematicSpec);
    
    if (!schematicValidation.ok) {
      return NextResponse.json(
        { 
          error: "Invalid schematic specification",
          details: schematicValidation.errors.map(e => e.message)
        },
        { status: 422 }
      );
    }
    
    const schematicSpec = schematicValidation.parsed!;
    
    // Run EDA enrichment
    const enrichedEda = await runEdaEnrich(projectId, schematicSpec, body.mech);
    
    console.log(`[EDA_ENRICH_API] EDA enrichment completed successfully`);
    
    return NextResponse.json({
      ok: true,
      edaSpec: enrichedEda,
      message: "EDA specification enriched successfully",
      stats: {
        components: enrichedEda.components.length,
        netClasses: enrichedEda.netClasses.length,
        placementCount: enrichedEda.placement.length,
        openQuestions: enrichedEda.openQuestions?.length || 0
      }
    });
    
  } catch (error) {
    console.error('[EDA_ENRICH_API] EDA enrichment failed:', error);
    
    return NextResponse.json(
      { 
        ok: false,
        error: "EDA enrichment failed", 
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}