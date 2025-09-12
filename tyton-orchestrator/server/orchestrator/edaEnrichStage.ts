import { SchematicSpec } from "@/server/validation/schematicSpecValidator";
import { EdaSpecV1, EdaComponentZ } from "@/server/services/eda/spec";
import { validateEdaSpec, validateLLMPatches, validateComponentAttributes } from "@/server/services/eda/validateEda";
import { seedEdaFromSchematic } from "@/server/services/eda/mapFromSchematic";
import { renderEdaEnrichPrompt } from "@/lib/prompts/p8_eda_enrich";
import { applySuggestions } from "@/server/services/eda/libraryLookup";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import pino from "pino";
import { llmRouter } from "@/server/llm/router";
import { LLMPatchResponseZ, validateLLMResponse } from "@/server/llm/schemas";
import { buildEdaEnrichPrompt, ProjectMeta, UnresolvedComponent } from "@/server/llm/prompts";

const prisma = new PrismaClient();
const logger = pino().child({ service: 'edaEnrichStage' });

// Zod schema for LLM response validation
const LLMPatchResponseZ = z.object({
  patches: z.array(z.object({
    ref: z.string(),
    symbol: z.string(),
    footprint: z.string(), 
    confidence: z.number().min(0).max(1),
    notes: z.string().optional()
  }))
});

type LLMPatchResponse = z.infer<typeof LLMPatchResponseZ>;

interface LLMResponse {
  content: string;
}

// Real LLM call using the router with retry logic
async function callLLMForPatch(
  projectMeta: ProjectMeta, 
  unresolvedComponents: UnresolvedComponent[]
): Promise<LLMPatchResponse> {
  logger.info({ 
    componentCount: unresolvedComponents.length,
    projectTitle: projectMeta.title 
  }, 'Making LLM call for component patches');
  
  try {
    // Build the structured prompt
    const { system, user } = buildEdaEnrichPrompt(projectMeta, unresolvedComponents);
    
    // Call LLM router with retry enabled by default
    const jsonResponse = await llmRouter.completeJSON({
      system,
      user,
      schema: LLMPatchResponseZ,
      options: {
        maxTokens: 4000,
        temperature: 0.1,
        enableRetry: true,
        retryOptions: {
          max: 3,
          baseMs: 1000,
          capMs: 10000
        }
      }
    });
    
    // Parse and validate the JSON response
    const parsedResponse = JSON.parse(jsonResponse);
    const validation = validateLLMResponse(parsedResponse, LLMPatchResponseZ);
    
    if (!validation.success) {
      throw new Error(`LLM response validation failed: ${validation.errors?.join(', ')}`);
    }
    
    const result = validation.data!;
    logger.info({ 
      patchCount: result.patches.length,
      avgConfidence: result.metadata?.avg_confidence,
      strategy: result.metadata?.assignment_strategy
    }, 'LLM patches validated successfully');
    
    return result;
    
  } catch (error: any) {
    logger.error({ 
      error: error.message,
      componentCount: unresolvedComponents.length 
    }, 'LLM enrichment failed');
    throw new Error(`LLM enrichment failed: ${error.message}`);
  }
}

export async function runEdaEnrich(
  projectId: string, 
  schematic: SchematicSpec, 
  mech?: any
): Promise<EdaSpecV1> {
  logger.info({ projectId }, 'Starting EDA enrichment');
  
  try {
    // Step 1: Generate seed EDA spec from schematic
    logger.info('Generating seed EDA spec');
    const seedEda = seedEdaFromSchematic(schematic);
    
    // Step 2: Apply DB-first library lookup with heuristic fallback  
    logger.info('Applying DB-first library mapping');
    const suggestionResult = await applySuggestions(seedEda, { 
      preserveExisting: true,
      minHeuristicConfidence: 0.75
    });
    
    const { eda: mappedEda, changes, tbd, dbHits, heuristicHits, unresolved } = suggestionResult;
    
    logger.info({ 
      changes, 
      tbd, 
      dbHits, 
      heuristicHits, 
      unresolvedCount: unresolved.length 
    }, 'Library mapping completed');
    
    // Step 3: Load existing EDA data for reconciliation  
    const existingModule = await prisma.module.findFirst({
      where: { projectId, kind: "eda" }
    });
    
    let existingEda: EdaSpecV1 | null = null;
    if (existingModule?.metadata) {
      try {
        const metadata = JSON.parse(existingModule.metadata as string);
        if (metadata.edaSpec) {
          const validation = validateEdaSpec(metadata.edaSpec);
          if (validation.ok) {
            existingEda = validation.spec!;
            logger.info('Loaded existing EDA spec for reconciliation');
          }
        }
      } catch (e) {
        logger.warn({ error: e.message }, 'Could not parse existing EDA spec');
      }
    }
    
    let finalEda = mappedEda;
    
    // Step 4: Call LLM only for unresolved components
    if (unresolved.length > 0) {
      logger.info({ unresolvedCount: unresolved.length }, 'Calling LLM for unresolved components');
      
      try {
        const projectMeta: ProjectMeta = {
          title: schematic.title,
          description: schematic.description,
          boardSize: { width: mappedEda.board.outline_mm.width, height: mappedEda.board.outline_mm.height },
          componentCount: mappedEda.components.length
        };
        
        // Convert unresolved components to the expected format
        const unresolvedComponents: UnresolvedComponent[] = unresolved.map(comp => ({
          ref: comp.ref,
          value: comp.value,
          description: comp.description,
          pins: comp.pins,
          power_rating: comp.power_rating,
          voltage_rating: comp.voltage_rating,
          current_rating: comp.current_rating,
          frequency_range: comp.frequency_range,
          package_hint: comp.package_hint,
          component_type: comp.component_type
        }));
        
        const llmPatches = await callLLMForPatch(projectMeta, unresolvedComponents);
        
        // Apply LLM patches to components
        logger.info({ patchCount: llmPatches.patches.length }, 'Applying LLM patches');
        finalEda = applyPatchesToEda(mappedEda, llmPatches.patches);
        
      } catch (llmError) {
        logger.warn({ error: llmError.message }, 'LLM enrichment failed, using DB/heuristic results');
        // Continue with mapped EDA - don't fail the whole process
        finalEda.openQuestions = [
          ...(mappedEda.openQuestions || []),
          `LLM enrichment failed: ${llmError.message}. ${unresolved.length} components remain unresolved.`
        ];
      }
    }
    
    // Step 5: Reconciliation with existing user edits
    logger.info('Reconciling with existing user edits');
    const mergedEda = reconcileEdaSpecs(seedEda, finalEda, existingEda);
    
    // Step 6: Final validation
    const finalValidation = validateEdaSpec(mergedEda);
    if (!finalValidation.ok) {
      throw new Error(`Merged EDA spec validation failed: ${finalValidation.errors.join(', ')}`);
    }
    
    // Step 7: Persist to database
    logger.info('Persisting enriched EDA spec');
    await persistEdaSpec(projectId, mergedEda);
    
    logger.info({
      totalComponents: mergedEda.components.length,
      dbHits,
      heuristicHits,
      llmPatches: unresolved.length,
      finalTbd: mergedEda.components.filter(c => c.symbol === 'TBD' || c.footprint === 'TBD').length
    }, 'EDA enrichment completed successfully');
    
    return mergedEda;
    
  } catch (error) {
    logger.error({ error: error.message }, 'EDA enrichment failed');
    
    // Return library suggestions with error details as fallback
    const seedEda = seedEdaFromSchematic(schematic);
    const { eda: fallbackEda } = await applySuggestions(seedEda, { preserveExisting: true });
    fallbackEda.openQuestions = [
      ...(fallbackEda.openQuestions || []),
      `EDA enrichment failed: ${error.message}. Using DB/heuristic mapping only.`
    ];
    
    // Persist fallback
    await persistEdaSpec(projectId, fallbackEda);
    return fallbackEda;
  }
}

// Helper function to apply LLM patches to EDA components
function applyPatchesToEda(eda: EdaSpecV1, patches: Array<{
  ref: string;
  symbol: string;
  footprint: string;
  confidence: number;
  notes?: string;
}>): EdaSpecV1 {
  const patchMap = new Map(patches.map(p => [p.ref, p]));
  
  const updatedComponents = eda.components.map(component => {
    const patch = patchMap.get(component.ref);
    if (!patch) return component;
    
    // Apply patch only if current values are TBD or missing
    const shouldApplySymbol = !component.symbol || component.symbol === 'TBD';
    const shouldApplyFootprint = !component.footprint || component.footprint === 'TBD';
    
    const newAttributes = {
      ...(component.attributes || {}),
      ...(patch.confidence && { llm_confidence: patch.confidence }),
      ...(patch.notes && { llm_notes: patch.notes }),
      mapping_source: component.attributes?.mapping_source || 'llm'
    };
    
    // Validate attributes for safety
    const attrValidation = validateComponentAttributes(newAttributes);
    if (!attrValidation.ok) {
      logger.warn({ 
        ref: component.ref, 
        errors: attrValidation.errors 
      }, 'Component attributes validation failed, using original attributes');
      // Use original attributes if validation fails
      return {
        ...component,
        ...(shouldApplySymbol && patch.symbol !== 'TBD' && { symbol: patch.symbol }),
        ...(shouldApplyFootprint && patch.footprint !== 'TBD' && { footprint: patch.footprint })
      };
    }

    return {
      ...component,
      ...(shouldApplySymbol && patch.symbol !== 'TBD' && { symbol: patch.symbol }),
      ...(shouldApplyFootprint && patch.footprint !== 'TBD' && { footprint: patch.footprint }),
      attributes: newAttributes
    };
  });
  
  return { ...eda, components: updatedComponents };
}

function reconcileEdaSpecs(
  seed: EdaSpecV1, 
  llm: EdaSpecV1, 
  existing: EdaSpecV1 | null
): EdaSpecV1 {
  console.log('[EDA_ENRICH] Reconciling seed, LLM, and existing EDA specs');
  
  // Start with LLM as base (most enriched)
  const merged: EdaSpecV1 = { ...llm };
  
  // Reconcile components: preserve human-edited footprints/symbols
  const reconciledComponents = merged.components.map(llmComp => {
    const existingComp = existing?.components.find(c => c.ref === llmComp.ref);
    
    // If user has manually edited footprint/symbol, preserve it
    if (existingComp) {
      return {
        ...llmComp,
        symbol: existingComp.symbol || llmComp.symbol,
        footprint: existingComp.footprint || llmComp.footprint,
        orientation_deg: existingComp.orientation_deg ?? llmComp.orientation_deg,
        // Preserve user placement edits
        // Note: placement is handled separately in placement array
      };
    }
    
    // Otherwise, prefer LLM values, fall back to seed if LLM missing
    const seedComp = seed.components.find(c => c.ref === llmComp.ref);
    return {
      ...llmComp,
      symbol: llmComp.symbol || seedComp?.symbol,
      footprint: llmComp.footprint || seedComp?.footprint,
    };
  });
  
  merged.components = reconciledComponents;
  
  // Reconcile net classes: dedupe by name, prefer larger widths/clearances
  const netClassMap = new Map<string, any>();
  
  // Add seed classes first
  seed.netClasses.forEach(nc => netClassMap.set(nc.name, nc));
  
  // Add/override with LLM classes (prefer larger values)
  llm.netClasses.forEach(llmNC => {
    const existing = netClassMap.get(llmNC.name);
    if (!existing) {
      netClassMap.set(llmNC.name, llmNC);
    } else {
      netClassMap.set(llmNC.name, {
        ...llmNC,
        track_mm: Math.max(existing.track_mm, llmNC.track_mm),
        clearance_mm: Math.max(existing.clearance_mm, llmNC.clearance_mm),
        via_diam_mm: Math.max(existing.via_diam_mm || 0, llmNC.via_diam_mm || 0),
        via_drill_mm: Math.max(existing.via_drill_mm || 0, llmNC.via_drill_mm || 0),
      });
    }
  });
  
  // Override with existing user classes if present
  if (existing) {
    existing.netClasses.forEach(existingNC => {
      netClassMap.set(existingNC.name, existingNC); // User edits win
    });
  }
  
  merged.netClasses = Array.from(netClassMap.values());
  
  // Reconcile placement: prefer existing user positions, then LLM, then seed
  const placementMap = new Map<string, any>();
  
  seed.placement.forEach(p => placementMap.set(p.ref, p));
  merged.placement.forEach(p => placementMap.set(p.ref, p));  // LLM overrides seed
  if (existing) {
    existing.placement.forEach(p => placementMap.set(p.ref, p)); // User overrides LLM
  }
  
  merged.placement = Array.from(placementMap.values());
  
  // Merge constraints by union
  if (seed.constraints || existing?.constraints) {
    merged.constraints = {
      high_current_nets: [
        ...(seed.constraints?.high_current_nets || []),
        ...(merged.constraints?.high_current_nets || []),
        ...(existing?.constraints?.high_current_nets || [])
      ].reduce((acc, net) => {
        const exists = acc.find(n => n.net === net.net);
        if (!exists) {
          acc.push(net);
        } else if (net.min_track_mm > exists.min_track_mm) {
          exists.min_track_mm = net.min_track_mm; // Prefer larger track width
        }
        return acc;
      }, [] as any[]),
      
      antenna_keepouts: [
        ...(seed.constraints?.antenna_keepouts || []),
        ...(merged.constraints?.antenna_keepouts || []),
        ...(existing?.constraints?.antenna_keepouts || [])
      ].reduce((acc, keepout) => {
        const exists = acc.find(k => k.ref === keepout.ref);
        if (!exists) {
          acc.push(keepout);
        } else if (keepout.radius_mm > exists.radius_mm) {
          exists.radius_mm = keepout.radius_mm; // Prefer larger radius
        }
        return acc;
      }, [] as any[]),
      
      analog_islands: [
        ...(seed.constraints?.analog_islands || []),
        ...(merged.constraints?.analog_islands || []),
        ...(existing?.constraints?.analog_islands || [])
      ].filter((island, index, arr) => arr.indexOf(island) === index) // Dedupe
    };
  }
  
  // Append open questions from all sources
  merged.openQuestions = [
    ...(seed.openQuestions || []),
    ...(merged.openQuestions || []),
    ...(existing?.openQuestions || [])
  ].filter((q, index, arr) => arr.indexOf(q) === index); // Dedupe
  
  console.log(`[EDA_ENRICH] Reconciliation complete: ${merged.components.length} components, ${merged.netClasses.length} net classes`);
  return merged;
}

async function persistEdaSpec(projectId: string, edaSpec: EdaSpecV1): Promise<void> {
  const timestamp = new Date().toISOString();
  
  const metadata = {
    edaSpec,
    version: edaSpec.version,
    timestamp,
    // Keep a simple history for versioning
    lastEnrichment: timestamp
  };
  
  await prisma.module.upsert({
    where: { 
      id: (await prisma.module.findFirst({ 
        where: { projectId, kind: "eda" } 
      }))?.id || "___new_eda___" 
    },
    update: {
      label: "EDA Layout Specification",
      detailsMd: generateEdaSummaryMd(edaSpec),
      metadata: JSON.stringify(metadata),
    },
    create: {
      projectId,
      kind: "eda",
      label: "EDA Layout Specification", 
      detailsMd: generateEdaSummaryMd(edaSpec),
      metadata: JSON.stringify(metadata),
    }
  });
}

function generateEdaSummaryMd(eda: EdaSpecV1): string {
  let md = "# EDA Layout Specification v1.0\\n\\n";
  
  md += `## Board Overview\\n`;
  md += `- **Target**: ${eda.target.tool} ${eda.target.version}\\n`;
  md += `- **Dimensions**: ${eda.board.outline_mm.width}×${eda.board.outline_mm.height}mm\\n`;
  md += `- **Layers**: ${eda.board.layers}\\n`;
  md += `- **Components**: ${eda.components.length}\\n\\n`;
  
  if (eda.netClasses.length > 0) {
    md += `## Net Classes\\n`;
    eda.netClasses.forEach(nc => {
      md += `- **${nc.name}**: ${nc.track_mm}mm track, ${nc.clearance_mm}mm clearance\\n`;
    });
    md += "\\n";
  }
  
  const componentsByGroup = eda.placement.reduce((acc, p) => {
    const group = p.group || "Misc";
    if (!acc[group]) acc[group] = 0;
    acc[group]++;
    return acc;
  }, {} as Record<string, number>);
  
  if (Object.keys(componentsByGroup).length > 0) {
    md += `## Component Groups\\n`;
    Object.entries(componentsByGroup).forEach(([group, count]) => {
      md += `- **${group}**: ${count} components\\n`;
    });
    md += "\\n";
  }
  
  if (eda.openQuestions && eda.openQuestions.length > 0) {
    md += `## Open Questions\\n`;
    eda.openQuestions.forEach(q => md += `- ${q}\\n`);
    md += "\\n";
  }
  
  md += `## Manufacturing\\n`;
  if (eda.manufacturing) {
    const mfg = eda.manufacturing;
    md += `- **Fab**: ${mfg.fab || 'TBD'}\\n`;
    md += `- **Thickness**: ${mfg.thickness_mm || 1.6}mm\\n`;
    md += `- **Min Track**: ${mfg.min_track_mm || 0.127}mm\\n`;
    md += `- **Finish**: ${mfg.finish || 'HASL'}\\n`;
  }
  
  return md;
}