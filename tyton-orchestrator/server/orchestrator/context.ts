import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const ComponentPickZ = z.object({
  category: z.string(),
  name: z.string(),
  mpn: z.string().optional(),
  footprint: z.string().optional(),
  symbol: z.string().optional(),
});

export const OrchestratorContextZ = z.object({
  version: z.literal("2"),
  project: z.object({
    id: z.string(),
    title: z.string(),
    owner: z.string().optional(),
    constraints: z.any().optional(), // mech/safety
  }),
  inputs: z.object({
    userBrief: z.string().optional(),
    attachments: z.array(z.any()).optional(),
  }),
  analysis: z.object({
    viability: z.any().optional(),
    safetyFlags: z.array(z.string()).default([]),
  }),
  selection: z.object({
    components: z.array(ComponentPickZ).default([]),
    pinMap: z.any().optional(),
  }),
  schematic: z.object({
    specV12: z.any().optional(), // validated schematicSpec v1.2
    erc: z.any().optional(),
  }),
  eda: z.object({
    specV1: z.any().optional(), // edaSpec v1.0 (KiCad)
    drc: z.any().optional(),
  }),
  wiring: z.object({
    md: z.string().optional(),
    edges: z.array(z.any()).optional(),
  }),
  bom: z.object({
    items: z.array(z.any()).default([]),
    sourcing: z.array(z.any()).default([]),
  }),
  logs: z.array(z.object({
    t: z.string(),
    level: z.enum(["info", "warn", "error"]),
    msg: z.string(),
    meta: z.any().optional()
  })).default([]),
}).strict();

export type OrchestratorContext = z.infer<typeof OrchestratorContextZ>;

/**
 * Load context from database
 */
export async function loadContext(orchestratorId: string): Promise<OrchestratorContext | null> {
  const run = await prisma.orchestratorRun.findUnique({
    where: { id: orchestratorId }
  });

  if (!run) return null;

  try {
    const parsed = JSON.parse(run.contextJson);
    return OrchestratorContextZ.parse(parsed);
  } catch (e) {
    console.error(`Failed to parse context for run ${orchestratorId}:`, e);
    return null;
  }
}

/**
 * Save context to database
 */
export async function saveContext(orchestratorId: string, ctx: OrchestratorContext): Promise<void> {
  // Validate context before saving
  const validated = OrchestratorContextZ.parse(ctx);
  
  await prisma.orchestratorRun.update({
    where: { id: orchestratorId },
    data: {
      contextJson: JSON.stringify(validated),
      updatedAt: new Date()
    }
  });
}

/**
 * Initialize new context for a project
 */
export async function initContext(projectId: string, userBrief?: string): Promise<OrchestratorContext> {
  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const ctx: OrchestratorContext = {
    version: "2",
    project: {
      id: projectId,
      title: project.title,
      owner: undefined, // Can be set if user system exists
      constraints: undefined,
    },
    inputs: {
      userBrief: userBrief || project.description,
      attachments: [],
    },
    analysis: {
      viability: undefined,
      safetyFlags: [],
    },
    selection: {
      components: [],
      pinMap: undefined,
    },
    schematic: {
      specV12: undefined,
      erc: undefined,
    },
    eda: {
      specV1: undefined,
      drc: undefined,
    },
    wiring: {
      md: undefined,
      edges: [],
    },
    bom: {
      items: [],
      sourcing: [],
    },
    logs: [{
      t: new Date().toISOString(),
      level: "info",
      msg: "Orchestrator context initialized",
      meta: { projectId }
    }],
  };

  return ctx;
}

/**
 * Add log entry to context
 */
export function addLog(
  ctx: OrchestratorContext,
  level: "info" | "warn" | "error",
  msg: string,
  meta?: any
): OrchestratorContext {
  return {
    ...ctx,
    logs: [
      ...ctx.logs,
      {
        t: new Date().toISOString(),
        level,
        msg,
        meta
      }
    ]
  };
}