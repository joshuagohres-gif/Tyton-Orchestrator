// components/nodes/types.ts
import { z } from "zod";

export const ModuleKind = z.enum(["electronics","mechanical","bom","sourcing"]);
export type ModuleKind = z.infer<typeof ModuleKind>;

export const BaseModuleZ = z.object({
  id: z.string(),
  kind: ModuleKind,
  title: z.string(),
  status: z.enum(["draft","in_progress","blocked","ready"]).default("draft"),
  tags: z.array(z.string()).default([]),
  meta: z.record(z.any()).default({}),   // freeform per-kind details
  // for wiring/dependencies
  nets: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]), // other module ids
  updatedAt: z.string().optional()
});
export type BaseModule = z.infer<typeof BaseModuleZ>;

// Electronics module specific schemas
export const ElectronicsComponentZ = z.object({
  ref: z.string(),
  value: z.string().optional(),
  mpn: z.string().optional(),
  symbol: z.string().optional(),
  footprint: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
  datasheet_url: z.string().url().optional(),
  lifecycle: z.enum(["active", "nrnd", "obsolete", "unknown"]).default("unknown"),
  pins: z.array(z.object({
    number: z.string(),
    name: z.string(),
    type: z.enum(["power", "ground", "input", "output", "io", "clock", "analog"]).optional()
  })).default([])
});

export const ElectronicsFirmwareZ = z.object({
  target: z.string(), // MCU/board target
  artifacts: z.array(z.object({
    path: z.string(),
    hash: z.string().optional(),
    type: z.enum(["hex", "bin", "elf", "uf2"]).optional()
  })).default([]),
  build_command: z.string().optional(),
  flash_command: z.string().optional(),
  version: z.string().optional()
});

export const ElectronicsTestZ = z.object({
  steps: z.array(z.object({
    name: z.string(),
    description: z.string(),
    expected: z.string().optional(),
    result: z.enum(["pass", "fail", "skip", "pending"]).optional(),
    notes: z.string().optional()
  })).default([]),
  fixtures: z.array(z.string()).default([]),
  last_run: z.string().optional(),
  pass_rate: z.number().min(0).max(1).optional()
});

export const ElectronicsMetaZ = z.object({
  components: z.array(ElectronicsComponentZ).default([]),
  firmware: ElectronicsFirmwareZ.optional(),
  testing: ElectronicsTestZ.optional(),
  schematic_path: z.string().optional(),
  pcb_path: z.string().optional(),
  power_budget: z.object({
    total_current_ma: z.number().optional(),
    voltage_rails: z.array(z.object({
      voltage: z.string(),
      current_ma: z.number(),
      consumers: z.array(z.string())
    })).default([])
  }).optional()
});

// Mechanical module specific schemas
export const MechanicalDimensionZ = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.enum(["mm", "cm", "in"]).default("mm"),
  tolerance: z.string().optional(),
  notes: z.string().optional()
});

export const MechanicalAttachmentZ = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["step", "stl", "glb", "dwg", "pdf"]),
  thumbnail_path: z.string().optional(),
  size_bytes: z.number().optional(),
  uploaded_at: z.string().optional()
});

export const MechanicalMetaZ = z.object({
  dimensions: z.array(MechanicalDimensionZ).default([]),
  attachments: z.array(MechanicalAttachmentZ).default([]),
  material: z.string().optional(),
  finish: z.string().optional(),
  manufacturing_process: z.string().optional(),
  mount_points: z.array(z.object({
    name: z.string(),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    type: z.enum(["screw", "snap", "clip", "magnet"]).optional()
  })).default([])
});

// BOM module specific schemas
export const BOMLineItemZ = z.object({
  ref: z.string(),
  mpn: z.string(),
  manufacturer: z.string().optional(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number().optional(),
  currency: z.string().default("USD"),
  lead_time_days: z.number().optional(),
  lifecycle: z.enum(["active", "nrnd", "obsolete", "unknown"]).default("unknown"),
  datasheet_url: z.string().url().optional(),
  supplier: z.string().optional(),
  supplier_sku: z.string().optional(),
  last_updated: z.string().optional()
});

export const BOMCostingZ = z.object({
  total_cost: z.number().optional(),
  currency: z.string().default("USD"),
  price_breaks: z.array(z.object({
    quantity: z.number().int().positive(),
    unit_price: z.number(),
    total_price: z.number()
  })).default([]),
  target_cost: z.number().optional(),
  cost_variance: z.number().optional() // actual vs target
});

export const BOMMetaZ = z.object({
  line_items: z.array(BOMLineItemZ).default([]),
  costing: BOMCostingZ.optional(),
  readiness_percent: z.number().min(0).max(100).optional(),
  vendor_distribution: z.record(z.number()).default({}), // vendor -> count
  total_items: z.number().int().default(0),
  last_costed: z.string().optional()
});

// Sourcing module specific schemas
export const SourcingVendorZ = z.object({
  name: z.string(),
  contact: z.string().optional(),
  quote_ref: z.string().optional(),
  price: z.number().optional(),
  moq: z.number().int().optional(),
  lead_time_days: z.number().optional(),
  currency: z.string().default("USD"),
  valid_until: z.string().optional(),
  notes: z.string().optional()
});

export const SourcingStockZ = z.object({
  mpn: z.string(),
  available_qty: z.number().int().default(0),
  required_qty: z.number().int().default(0),
  risk_level: z.enum(["low", "medium", "high", "critical"]).default("low"),
  alternates: z.array(z.object({
    mpn: z.string(),
    reason: z.string(),
    drop_in: z.boolean().default(false)
  })).default([]),
  last_checked: z.string().optional()
});

export const SourcingMetaZ = z.object({
  vendors: z.array(SourcingVendorZ).default([]),
  stock_status: z.array(SourcingStockZ).default([]),
  preferred_vendors: z.array(z.string()).default([]),
  total_quotes: z.number().int().default(0),
  high_risk_parts: z.number().int().default(0),
  last_sourced: z.string().optional()
});

// Module type unions
export const ElectronicsModuleZ = BaseModuleZ.extend({
  kind: z.literal("electronics"),
  meta: ElectronicsMetaZ
});

export const MechanicalModuleZ = BaseModuleZ.extend({
  kind: z.literal("mechanical"),
  meta: MechanicalMetaZ
});

export const BOMModuleZ = BaseModuleZ.extend({
  kind: z.literal("bom"),
  meta: BOMMetaZ
});

export const SourcingModuleZ = BaseModuleZ.extend({
  kind: z.literal("sourcing"),
  meta: SourcingMetaZ
});

export const ModuleZ = z.discriminatedUnion("kind", [
  ElectronicsModuleZ,
  MechanicalModuleZ,
  BOMModuleZ,
  SourcingModuleZ
]);

export type ElectronicsModule = z.infer<typeof ElectronicsModuleZ>;
export type MechanicalModule = z.infer<typeof MechanicalModuleZ>;
export type BOMModule = z.infer<typeof BOMModuleZ>;
export type SourcingModule = z.infer<typeof SourcingModuleZ>;
export type Module = z.infer<typeof ModuleZ>;

// Edge types for canvas
export const EdgeTypeZ = z.enum(["dependency", "net", "bus"]);
export type EdgeType = z.infer<typeof EdgeTypeZ>;

export const ModuleEdgeZ = z.object({
  id: z.string(),
  source: z.string(), // module id
  target: z.string(), // module id  
  type: EdgeTypeZ,
  label: z.string().optional(),
  data: z.object({
    nets: z.array(z.string()).optional(), // for net/bus edges
    pins: z.array(z.object({
      source_pin: z.string(),
      target_pin: z.string()
    })).optional(),
    color: z.string().optional() // for visual grouping
  }).optional()
});

export type ModuleEdge = z.infer<typeof ModuleEdgeZ>;

// Validation helper
export function validateModule(kind: ModuleKind, data: unknown): { 
  success: boolean; 
  data?: Module; 
  errors?: string[] 
} {
  try {
    let schema: z.ZodSchema<Module>;
    
    switch (kind) {
      case "electronics":
        schema = ElectronicsModuleZ;
        break;
      case "mechanical":
        schema = MechanicalModuleZ;
        break;
      case "bom":
        schema = BOMModuleZ;
        break;
      case "sourcing":
        schema = SourcingModuleZ;
        break;
      default:
        return { success: false, errors: [`Unknown module kind: ${kind}`] };
    }
    
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { 
        success: false, 
        errors: error.errors?.map(e => `${e.path.join('.')}: ${e.message}`) || ['Unknown validation error']
      };
    }
    return { 
      success: false, 
      errors: [error instanceof Error ? error.message : 'Unknown validation error']
    };
  }
}

// Status color mapping for UI
export const StatusColors = {
  draft: "bg-gray-100 text-gray-800 border-gray-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200", 
  blocked: "bg-red-100 text-red-800 border-red-200",
  ready: "bg-green-100 text-green-800 border-green-200"
} as const;

// Module kind color mapping
export const KindColors = {
  electronics: "bg-purple-50 border-purple-200",
  mechanical: "bg-orange-50 border-orange-200", 
  bom: "bg-emerald-50 border-emerald-200",
  sourcing: "bg-blue-50 border-blue-200"
} as const;