import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { validateEdaSpec } from "@/server/services/eda/validateEda";
import { validateSchematicSpec } from "@/server/validation/schematicSpecValidator";
import { runEdaDrc } from "@/server/services/eda/drc";
import { makeKiCadProjectZip } from "@/server/services/eda/generateKiCad";

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';
    
    console.log(`[EDA_EXPORT] Exporting KiCad project for ${projectId}, force=${force}`);
    
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
    
    // Run DRC checks
    console.log('[EDA_EXPORT] Running DRC checks');
    const drcResults = runEdaDrc(edaSpec, schematicSpec);
    
    // Check for blocking errors
    if (drcResults.errors.length > 0 && !force) {
      return NextResponse.json(
        { 
          error: "DRC errors prevent export", 
          errors: drcResults.errors,
          warnings: drcResults.warnings,
          hint: "Add ?force=1 to export anyway"
        },
        { 
          status: 422,
          headers: {
            'X-EDA-DRC': 'fail'
          }
        }
      );
    }
    
    // Generate KiCad project zip
    console.log('[EDA_EXPORT] Generating KiCad project files');
    const zipBuffer = await makeKiCadProjectZip(
      project.title || 'TytonProject',
      schematicSpec,
      edaSpec
    );
    
    // Set response headers
    const filename = `${(project.title || 'TytonProject').replace(/[^a-zA-Z0-9_-]/g, '_')}_KiCad.zip`;
    
    const headers = new Headers({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': zipBuffer.length.toString(),
      'X-EDA-Components': edaSpec.components.length.toString(),
      'X-EDA-Warnings': drcResults.warnings.length.toString(),
    });
    
    if (drcResults.errors.length > 0) {
      headers.set('X-EDA-DRC', 'fail');
      headers.set('X-EDA-Errors', drcResults.errors.length.toString());
    } else {
      headers.set('X-EDA-DRC', 'pass');
    }
    
    console.log(`[EDA_EXPORT] Export completed: ${zipBuffer.length} bytes`);
    return new NextResponse(zipBuffer, { headers });
    
  } catch (error) {
    console.error('[EDA_EXPORT] Export failed:', error);
    return NextResponse.json(
      { error: "Export failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}