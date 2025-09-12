import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { validateEdaSpec } from "@/server/services/eda/validateEda";
import { validateSchematicSpec } from "@/server/validation/schematicSpecValidator";
import { makeDsnText } from "@/server/services/eda/generateDSN";

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    
    console.log(`[DSN_EXPORT] Exporting DSN file for project ${projectId}`);
    
    // Get project details
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
        { error: "No schematic specification found for this project" },
        { status: 422 }
      );
    }
    
    // Get EDA module
    const edaModule = await prisma.module.findFirst({
      where: { projectId, kind: "eda" }
    });
    
    if (!edaModule?.metadata) {
      return NextResponse.json(
        { error: "No EDA specification found. Please run EDA enrichment first." },
        { status: 422 }
      );
    }
    
    // Parse and validate schematic spec
    const schematicMetadata = JSON.parse(schematicModule.metadata as string);
    const schematicValidation = validateSchematicSpec(schematicMetadata.schematicSpec);
    
    if (!schematicValidation.ok) {
      return NextResponse.json(
        { error: "Invalid schematic specification", details: schematicValidation.errors },
        { status: 422 }
      );
    }
    
    // Parse and validate EDA spec
    const edaMetadata = JSON.parse(edaModule.metadata as string);
    const edaValidation = validateEdaSpec(edaMetadata.edaSpec);
    
    if (!edaValidation.ok) {
      return NextResponse.json(
        { error: "Invalid EDA specification", details: edaValidation.errors },
        { status: 422 }
      );
    }
    
    const schematicSpec = schematicValidation.parsed!;
    const edaSpec = edaValidation.spec!;
    
    // Generate DSN content
    console.log('[DSN_EXPORT] Generating DSN file content');
    const dsnContent = makeDsnText(
      project.title || 'TytonProject',
      schematicSpec,
      edaSpec
    );
    
    // Set response headers for file download
    const filename = `${(project.title || 'TytonProject').replace(/[^a-zA-Z0-9_-]/g, '_')}.dsn`;
    
    const headers = new Headers({
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(dsnContent, 'utf8').toString(),
      'X-DSN-Components': edaSpec.components.length.toString(),
      'X-DSN-Nets': (schematicSpec.nets?.length || 0).toString(),
      'X-DSN-Layers': edaSpec.board.layers.toString(),
    });
    
    console.log(`[DSN_EXPORT] DSN export completed: ${dsnContent.length} characters`);
    return new NextResponse(dsnContent, { headers });
    
  } catch (error) {
    console.error('[DSN_EXPORT] DSN export failed:', error);
    return NextResponse.json(
      { error: "DSN export failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}