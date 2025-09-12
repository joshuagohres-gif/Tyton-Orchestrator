// /app/api/projects/[id]/schematic/render/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ingestSchematic } from "@/server/parsers/schematicFromLLM";
import { validateSchematicSpec } from "@/server/validation/schematicSpecValidator";
import { buildWiringArtifacts } from "@/server/services/wiringFromSpec";
import { computeLayout, createGridLayout } from "@/server/services/diagramLayout";
import { specToElk } from "@/server/services/specToElk";
import { computeElkLayout } from "@/server/services/elk";
import { gridLayout, dagreLayout } from "@/server/services/fallbackLayout";
import { z } from "zod";

const prisma = new PrismaClient();

const BodySchema = z.object({
  raw: z.string(),
  persist: z.boolean().default(true)
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = BodySchema.parse(await req.json());
    
    // Step 1: Ingest and normalize the schematic from raw LLM output
    console.log('Ingesting schematic from raw LLM output...');
    const { spec, warnings: ingestWarnings } = ingestSchematic(body.raw);
    
    // Step 2: Validate the schematic spec
    console.log('Validating schematic specification...');
    const validation = await validateSchematicSpec(spec);
    
    // Step 3: Build wiring artifacts
    console.log('Building wiring artifacts...');
    const { wiringMd, wiringJson, edges } = buildWiringArtifacts(spec);
    
    // Step 4: Compute layout with robust ELK integration
    console.log('Computing diagram layout...');
    let layout;
    try {
      console.log('[ROBUST_ELK] Attempting robust ELK layout');
      const elkGraph = specToElk(spec);
      layout = await computeElkLayout(elkGraph);
      console.log('[ROBUST_ELK] ELK layout successful');
    } catch (elkError) {
      console.warn('[ROBUST_ELK] ELK layout failed, trying Dagre fallback:', elkError);
      try {
        const elkGraph = specToElk(spec);
        layout = await dagreLayout(elkGraph);
        console.log('[ROBUST_ELK] Dagre fallback successful');
      } catch (dagreError) {
        console.warn('[ROBUST_ELK] Dagre layout failed, using grid fallback:', dagreError);
        const elkGraph = specToElk(spec);
        layout = gridLayout(elkGraph);
        console.log('[ROBUST_ELK] Grid fallback applied');
      }
    }
    
    const allWarnings = [
      ...ingestWarnings,
      ...(validation.warnings || []).map(w => `Validation: ${w.message}`)
    ];
    
    let moduleIds: { schematicModuleId?: string; wiringModuleId?: string } = {};
    
    // Step 5: Persist to database if requested
    if (body.persist) {
      console.log('Persisting schematic and wiring modules...');
      
      // Build detailed markdown for schematic module
      let schematicMd = "";
      schematicMd += "## Circuit Summary\n\n";
      schematicMd += spec.project?.description || "Generated circuit diagram";
      schematicMd += "\n\n";
      
      // Add component summary
      if (spec.components && spec.components.length > 0) {
        schematicMd += "## Components\n\n";
        spec.components.forEach(comp => {
          schematicMd += `- **${comp.ref}**: ${comp.mpn} (${comp.footprint})\n`;
          schematicMd += `  - ${comp.description}\n`;
        });
        schematicMd += "\n";
      }
      
      // Add power tree
      if (spec.powerTree && spec.powerTree.length > 0) {
        schematicMd += "## Power Distribution\n\n";
        spec.powerTree.forEach(rail => {
          if (rail.source) {
            schematicMd += `- **${rail.source.ref}**: ${rail.source.type} ${rail.source.voltage_V}V\n`;
          }
          if (rail.regulator) {
            schematicMd += `- **${rail.regulator.ref}**: ${rail.regulator.topology.toUpperCase()} ${rail.regulator.vout_V}V\n`;
          }
        });
        schematicMd += "\n";
      }
      
      // Add buses
      if (spec.buses && spec.buses.length > 0) {
        schematicMd += "## Communication Buses\n\n";
        spec.buses.forEach(bus => {
          schematicMd += `- **${bus.name}**: ${bus.type}\n`;
          schematicMd += `  - Nets: ${bus.nets.join(', ')}\n`;
          schematicMd += `  - Members: ${bus.members.map(m => `${m.ref}(${m.role})`).join(', ')}\n`;
        });
        schematicMd += "\n";
      }
      
      // Add validation results
      schematicMd += "## Validation Results\n\n";
      if (validation.errors && validation.errors.length > 0) {
        schematicMd += "### Errors\n";
        validation.errors.forEach(e => schematicMd += `- ❌ **${e.code}**: ${e.message}\n`);
        schematicMd += "\n";
      }
      if (validation.warnings && validation.warnings.length > 0) {
        schematicMd += "### Warnings\n";
        validation.warnings.forEach(w => schematicMd += `- ⚠️ **${w.code}**: ${w.message}\n`);
        schematicMd += "\n";
      }
      if ((!validation.errors || validation.errors.length === 0) && 
          (!validation.warnings || validation.warnings.length === 0)) {
        schematicMd += "✅ All validation checks passed!\n\n";
      }
      
      // Upsert schematic module
      const schematicModule = await prisma.module.upsert({
        where: { 
          id: (await prisma.module.findFirst({ 
            where: { projectId, kind: "schematic" } 
          }))?.id || "___new___" 
        },
        update: {
          label: "Circuit Schematic",
          detailsMd: schematicMd,
          metadata: JSON.stringify({ 
            schematicSpec: spec, 
            validator: validation,
            layout: layout,
            fullOutput: body.raw 
          }),
        },
        create: {
          projectId, 
          kind: "schematic", 
          label: "Circuit Schematic",
          detailsMd: schematicMd,
          metadata: JSON.stringify({ 
            schematicSpec: spec, 
            validator: validation,
            layout: layout,
            fullOutput: body.raw 
          }),
        }
      });
      
      // Upsert wiring module
      const wiringModule = await prisma.module.upsert({
        where: { 
          id: (await prisma.module.findFirst({ 
            where: { projectId, kind: "wiring" } 
          }))?.id || "___new___" 
        },
        update: {
          label: "Wiring Instructions",
          detailsMd: wiringMd,
          metadata: JSON.stringify({ wiring: wiringJson, spec: spec }),
        },
        create: {
          projectId, 
          kind: "wiring", 
          label: "Wiring Instructions",
          detailsMd: wiringMd,
          metadata: JSON.stringify({ wiring: wiringJson, spec: spec }),
        }
      });
      
      // Create/replace wiring connections on canvas
      await prisma.connection.deleteMany({ where: { projectId, type: "wiring" } });
      for (const e of edges) {
        await prisma.connection.create({ 
          data: {
            projectId,
            fromModuleId: e.fromModuleId,
            toModuleId: e.toModuleId,
            type: "wiring",
            label: e.label,
            metadata: JSON.stringify(e.meta || {})
          }
        });
      }
      
      moduleIds = {
        schematicModuleId: schematicModule.id,
        wiringModuleId: wiringModule.id
      };
    }
    
    // Return response
    return NextResponse.json({
      ok: validation.ok,
      spec,
      errors: validation.errors || [],
      warnings: allWarnings,
      layout,
      wiringMd,
      ...moduleIds
    });
    
  } catch (error: any) {
    console.error('Schematic render error:', error);
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message,
        errors: [{ code: 'RENDER_ERROR', message: error.message, severity: 'error' }],
        warnings: []
      },
      { status: 500 }
    );
  }
}