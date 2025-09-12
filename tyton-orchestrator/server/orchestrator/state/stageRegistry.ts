import type { OrchestratorContext } from "../context";
import { callLlmWithRetry } from "../llm";
import { runCircuitStage } from "../circuitStage";
import { runEdaEnrich } from "../edaEnrichStage";
import { validateSchematicSpec } from "@/server/validation/schematicSpecValidator";
import { validateEdaSpec } from "@/server/services/eda/validateEda";
import { llmRouter } from "@/server/llm/router";
import { z } from "zod";
import pino from "pino";

const logger = pino().child({ service: 'stageRegistry' });

export type StageId =
  | "review:project"
  | "analysis:viability_safety"
  | "selection:components"
  | "wiring:pins"
  | "schematic:generate"
  | "eda:enrich"
  | "placement:seed"
  | "export:bom"
  | "export:kicad"
  | "export:dsn";

export type StageRunResult = { 
  updatedCtx: OrchestratorContext; 
  reviewPayload?: any 
};

export interface StageDefinition {
  id: StageId;
  name: string;
  description: string;
  needsReview?: boolean;            // human-in-the-loop gate
  deps: StageId[];                  // dependencies
  run: (ctx: OrchestratorContext) => Promise<StageRunResult>;
  validate?: (ctx: OrchestratorContext) => Promise<{ ok: boolean; errors?: string[] }>;
  autoRepair?: (ctx: OrchestratorContext) => Promise<OrchestratorContext>; // optional: fix after validation failure
}

// Zod schemas for stage LLM responses
const SafetyAnalysisZ = z.object({
  viability: z.object({
    feasible: z.boolean(),
    score: z.number().min(0).max(1),
    concerns: z.array(z.string()),
    rationale: z.string().optional()
  }),
  safetyFlags: z.array(z.enum([
    "HIGH_VOLTAGE", 
    "HIGH_CURRENT", 
    "RF_EMISSION", 
    "BATTERY_HAZARD",
    "FLAMMABLE_MATERIALS",
    "PRESSURE_VESSEL",
    "EXPLOSIVE_RISK",
    "CHEMICAL_EXPOSURE"
  ])),
  recommendations: z.array(z.string()).optional(),
  compliance_notes: z.string().optional()
});

const ComponentSelectionZ = z.object({
  components: z.array(z.object({
    category: z.string(),
    name: z.string(),
    mpn: z.string().optional(),
    value: z.string().optional(),
    description: z.string().optional(),
    specifications: z.object({
      voltage_rating: z.string().optional(),
      current_rating: z.string().optional(),
      power_rating: z.string().optional(),
      package: z.string().optional(),
      tolerance: z.string().optional()
    }).optional(),
    alternatives: z.array(z.object({
      mpn: z.string(),
      notes: z.string().optional()
    })).optional(),
    selection_rationale: z.string().optional()
  })),
  total_estimated_cost_usd: z.number().positive().optional(),
  availability_notes: z.string().optional()
});

const PinMappingZ = z.object({
  connections: z.array(z.object({
    from: z.string(),
    from_pin: z.string().optional(),
    to: z.string(),
    to_pin: z.string().optional(),
    signal_type: z.enum(["power", "ground", "digital", "analog", "clock", "data"]).optional(),
    description: z.string().optional()
  })),
  power_tree: z.object({
    input_voltage: z.string(),
    rails: z.array(z.object({
      voltage: z.string(),
      current_max: z.string(),
      consumers: z.array(z.string())
    }))
  }).optional(),
  routing_notes: z.array(z.string()).optional()
});

// Real LLM implementations
async function performSafetyAnalysis(userBrief: string) {
  logger.info('Performing safety and viability analysis');
  
  const system = `You are an expert electronics safety engineer and project viability analyst.

Analyze the provided project description for:
1. Technical feasibility and complexity assessment
2. Safety hazards and regulatory considerations
3. Risk factors and mitigation strategies

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Assess feasibility realistically (0.0 = impossible, 1.0 = trivial)
3. Identify specific safety flags that apply
4. Provide actionable recommendations
5. Consider regulatory compliance (FCC, CE, UL, etc.)

Focus on real safety concerns, not hypothetical risks.`;

  const user = `PROJECT DESCRIPTION:
${userBrief}

Analyze this project for safety hazards, technical viability, and provide specific recommendations for safe implementation.`;

  const jsonResponse = await llmRouter.completeJSON({
    system,
    user,
    schema: SafetyAnalysisZ,
    options: {
      maxTokens: 2000,
      temperature: 0.2
    }
  });

  return JSON.parse(jsonResponse);
}

async function performComponentSelection(userBrief: string) {
  logger.info('Performing component selection');
  
  const system = `You are an expert electronics engineer specializing in component selection and bill of materials optimization.

Your task is to select appropriate electronic components based on project requirements.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Select realistic, commercially available components
3. Provide manufacturer part numbers (MPNs) when possible
4. Consider cost, availability, and performance trade-offs
5. Include component specifications for design validation
6. Suggest alternatives for critical components

Prefer common, well-supported components from established manufacturers (TI, ST, Analog Devices, etc.).`;

  const user = `PROJECT REQUIREMENTS:
${userBrief}

Select appropriate electronic components for this project. Focus on commonly available parts with good documentation and support.`;

  const jsonResponse = await llmRouter.completeJSON({
    system,
    user,
    schema: ComponentSelectionZ,
    options: {
      maxTokens: 3000,
      temperature: 0.3
    }
  });

  return JSON.parse(jsonResponse);
}

async function performPinMapping(components: any[]) {
  logger.info({ componentCount: components.length }, 'Performing pin mapping');
  
  const system = `You are an expert electronics engineer specializing in circuit design and pin mapping.

Your task is to create logical connections between selected components.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON - no markdown, explanations, or additional text
2. Create realistic pin connections based on component functions
3. Establish proper power distribution (VCC, GND, voltage rails)
4. Consider signal types and routing requirements
5. Follow good design practices (power decoupling, signal integrity)
6. Include power tree analysis for multi-rail designs

Focus on essential connections required for basic functionality.`;

  const user = `SELECTED COMPONENTS:
${components.map(comp => 
    `${comp.name} (${comp.category}): ${comp.mpn || comp.value || 'Generic'}${comp.description ? ` - ${comp.description}` : ''}`
  ).join('\n')}

Create logical pin connections between these components. Establish power distribution and signal routing.`;

  const jsonResponse = await llmRouter.completeJSON({
    system,
    user,
    schema: PinMappingZ,
    options: {
      maxTokens: 2500,
      temperature: 0.2
    }
  });

  return JSON.parse(jsonResponse);
}

export const STAGES: Record<StageId, StageDefinition> = {
  "review:project": {
    id: "review:project",
    name: "Project Review",
    description: "Human review of project requirements and safety considerations",
    needsReview: true,
    deps: [],
    run: async (ctx) => ({
      updatedCtx: ctx,
      reviewPayload: {
        summary: ctx.inputs.userBrief || "No project brief provided",
        details: {
          projectTitle: ctx.project.title,
          hasAttachments: (ctx.inputs.attachments?.length || 0) > 0,
          constraints: ctx.project.constraints
        },
        recommendations: [
          "Review project scope and requirements",
          "Verify safety considerations",
          "Confirm component budget and timeline"
        ]
      }
    })
  },

  "analysis:viability_safety": {
    id: "analysis:viability_safety",
    name: "Viability & Safety Analysis",
    description: "Analyze project viability and identify safety flags",
    deps: ["review:project"],
    run: async (ctx) => {
      const analysis = await performSafetyAnalysis(ctx.inputs.userBrief || "");

      return {
        updatedCtx: {
          ...ctx,
          analysis: {
            ...ctx.analysis,
            viability: analysis.viability,
            safetyFlags: analysis.safetyFlags,
            recommendations: analysis.recommendations,
            complianceNotes: analysis.compliance_notes
          }
        }
      };
    }
  },

  "selection:components": {
    id: "selection:components",
    name: "Component Selection",
    description: "Select and specify components based on requirements",
    deps: ["analysis:viability_safety"],
    run: async (ctx) => {
      const selection = await performComponentSelection(ctx.inputs.userBrief || "");

      return {
        updatedCtx: {
          ...ctx,
          selection: {
            ...ctx.selection,
            components: selection.components,
            estimatedCost: selection.total_estimated_cost_usd,
            availabilityNotes: selection.availability_notes
          }
        }
      };
    }
  },

  "wiring:pins": {
    id: "wiring:pins",
    name: "Pin Mapping",
    description: "Generate pin connections and wiring diagram",
    deps: ["selection:components"],
    run: async (ctx) => {
      const pinMapping = await performPinMapping(ctx.selection.components);

      return {
        updatedCtx: {
          ...ctx,
          selection: {
            ...ctx.selection,
            pinMap: pinMapping
          },
          wiring: {
            ...ctx.wiring,
            edges: pinMapping.connections,
            powerTree: pinMapping.power_tree,
            routingNotes: pinMapping.routing_notes
          }
        }
      };
    }
  },

  "schematic:generate": {
    id: "schematic:generate",
    name: "Schematic Generation",
    description: "Generate schematic specification from components and wiring",
    deps: ["wiring:pins"],
    run: async (ctx) => {
      // Use existing circuit stage implementation
      const schematicResult = await runCircuitStage(ctx.project.id, ctx.inputs.userBrief || "");

      return {
        updatedCtx: {
          ...ctx,
          schematic: {
            ...ctx.schematic,
            specV12: schematicResult // Assuming this returns SchematicSpec v1.2
          }
        }
      };
    },
    validate: async (ctx) => {
      if (!ctx.schematic.specV12) {
        return { ok: false, errors: ["No schematic specification generated"] };
      }

      const validation = validateSchematicSpec(ctx.schematic.specV12);
      return {
        ok: validation.ok,
        errors: validation.ok ? [] : validation.errors
      };
    }
  },

  "eda:enrich": {
    id: "eda:enrich",
    name: "EDA Enrichment",
    description: "Enrich schematic with EDA-specific data and library mappings",
    deps: ["schematic:generate"],
    run: async (ctx) => {
      if (!ctx.schematic.specV12) {
        throw new Error("No schematic specification available for EDA enrichment");
      }

      const edaSpec = await runEdaEnrich(
        ctx.project.id,
        ctx.schematic.specV12,
        ctx.project.constraints
      );

      return {
        updatedCtx: {
          ...ctx,
          eda: {
            ...ctx.eda,
            specV1: edaSpec
          }
        }
      };
    },
    validate: async (ctx) => {
      if (!ctx.eda.specV1) {
        return { ok: false, errors: ["No EDA specification generated"] };
      }

      const validation = validateEdaSpec(ctx.eda.specV1);
      return {
        ok: validation.ok,
        errors: validation.ok ? [] : validation.errors || []
      };
    }
  },

  "placement:seed": {
    id: "placement:seed",
    name: "Component Placement",
    description: "Generate initial component placement on PCB",
    deps: ["eda:enrich"],
    run: async (ctx) => {
      // Use existing placement logic
      const { runPlacement } = await import("@/server/services/eda/placement");
      
      if (!ctx.eda.specV1) {
        throw new Error("No EDA specification available for placement");
      }

      const updatedEda = await runPlacement(ctx.eda.specV1);

      return {
        updatedCtx: {
          ...ctx,
          eda: {
            ...ctx.eda,
            specV1: updatedEda
          }
        }
      };
    }
  },

  // Parallel export stages
  "export:bom": {
    id: "export:bom",
    name: "BOM Export",
    description: "Generate bill of materials",
    deps: ["eda:enrich"],
    run: async (ctx) => {
      if (!ctx.eda.specV1) {
        throw new Error("No EDA specification available for BOM export");
      }

      const bomItems = ctx.eda.specV1.components.map((comp: any) => ({
        category: comp.role || "Unknown",
        part_no: comp.mpn || comp.value || "TBD",
        description: `${comp.role || ""} ${comp.value || comp.mpn || ""}`.trim(),
        quantity: 1,
        unit_cost: null,
        extended_cost: null,
        notes: comp.symbol === "TBD" ? "Symbol/footprint TBD" : undefined
      }));

      return {
        updatedCtx: {
          ...ctx,
          bom: {
            ...ctx.bom,
            items: bomItems
          }
        }
      };
    }
  },

  "export:kicad": {
    id: "export:kicad",
    name: "KiCad Export",
    description: "Generate KiCad project files",
    deps: ["placement:seed"],
    run: async (ctx) => {
      const { generateKiCadProject } = await import("@/server/services/eda/generateKiCad");
      
      if (!ctx.eda.specV1) {
        throw new Error("No EDA specification available for KiCad export");
      }

      // Generate KiCad files (returns zip buffer)
      await generateKiCadProject(ctx.project.id, ctx.eda.specV1);

      return {
        updatedCtx: {
          ...ctx,
          logs: [
            ...ctx.logs,
            {
              t: new Date().toISOString(),
              level: "info" as const,
              msg: "KiCad project files generated",
              meta: { projectId: ctx.project.id }
            }
          ]
        }
      };
    }
  },

  "export:dsn": {
    id: "export:dsn",
    name: "DSN Export",
    description: "Generate DSN file for autorouting",
    deps: ["placement:seed"],
    run: async (ctx) => {
      const { generateDSN } = await import("@/server/services/eda/generateDSN");
      
      if (!ctx.eda.specV1) {
        throw new Error("No EDA specification available for DSN export");
      }

      // Generate DSN file
      await generateDSN(ctx.project.id, ctx.eda.specV1);

      return {
        updatedCtx: {
          ...ctx,
          logs: [
            ...ctx.logs,
            {
              t: new Date().toISOString(),
              level: "info" as const,
              msg: "DSN file generated for autorouting",
              meta: { projectId: ctx.project.id }
            }
          ]
        }
      };
    }
  }
};