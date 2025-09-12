import { z } from "zod";

// Component in EDA context (extends schematic with physical properties)
export const EdaComponentZ = z.object({
  ref: z.string(),                     // e.g., "U1", "R5"
  value: z.string().optional(),        // e.g., "10k", "100nF"
  mpn: z.string().optional(),          // Manufacturer part number
  role: z.string().optional(),         // MCU, Resistor, Capacitor, etc.
  symbol: z.string().optional(),       // KiCad symbol library reference
  footprint: z.string().optional(),    // KiCad footprint library reference
  orientation_deg: z.number().default(0), // Rotation in degrees
  attributes: z.record(z.any()).optional(), // Custom properties
});

// Net class for routing constraints
export const NetClassZ = z.object({
  name: z.string(),                    // e.g., "POWER", "SIGNAL", "USB"
  track_mm: z.number(),               // Track width in mm
  clearance_mm: z.number(),           // Clearance in mm
  via_diam_mm: z.number().optional(), // Via diameter
  via_drill_mm: z.number().optional(), // Via drill size
  description: z.string().optional(),
});

// Board physical properties
export const BoardZ = z.object({
  outline_mm: z.object({
    width: z.number(),
    height: z.number(),
    shape: z.enum(["rectangle", "custom"]).default("rectangle"),
  }),
  layers: z.number().min(2).max(16).default(2), // 2, 4, 6, etc.
  thickness_mm: z.number().default(1.6),
  zones: z.array(z.object({
    net: z.string(),                   // Net name for zone
    layer: z.string(),                 // "F.Cu", "B.Cu", etc.
    polygon_mm: z.array(z.object({     // Polygon points
      x: z.number(),
      y: z.number(),
    })).optional(),
  })).default([]),
});

// Component placement
export const PlacementZ = z.object({
  ref: z.string(),                     // Component reference
  x_mm: z.number(),                    // X position in mm
  y_mm: z.number(),                    // Y position in mm
  rotation_deg: z.number().default(0), // Rotation
  side: z.enum(["top", "bottom"]).default("top"),
  locked: z.boolean().default(false), // Prevent auto-placement
  group: z.string().optional(),       // Placement group
});

// Design constraints
export const ConstraintsZ = z.object({
  high_current_nets: z.array(z.object({
    net: z.string(),
    min_track_mm: z.number(),
    max_current_a: z.number().optional(),
  })).default([]),
  
  antenna_keepouts: z.array(z.object({
    ref: z.string(),                   // Component reference (e.g., antenna)
    radius_mm: z.number(),             // Keepout radius
    description: z.string().optional(),
  })).default([]),
  
  analog_islands: z.array(z.object({
    components: z.array(z.string()),   // Component refs in analog island
    moat_width_mm: z.number().default(1.0), // Isolation moat
  })).default([]),
  
  decoupling: z.array(z.object({
    power_ref: z.string(),             // Power component reference
    decouple_refs: z.array(z.string()), // Decoupling capacitor refs
    max_distance_mm: z.number().default(15), // Max distance constraint
  })).default([]),
});

// Manufacturing specifications
export const ManufacturingZ = z.object({
  fab: z.string().optional(),          // Fab house name
  min_track_mm: z.number().default(0.127), // 5 mil minimum
  min_via_mm: z.number().default(0.2),  // 8 mil minimum
  min_drill_mm: z.number().default(0.1), // 4 mil minimum
  finish: z.enum(["HASL", "ENIG", "OSP", "ImAg"]).default("HASL"),
  mask_color: z.string().default("green"),
  silk_color: z.string().default("white"),
  controlled_impedance: z.boolean().default(false),
  stackup: z.string().optional(),      // Stackup specification
});

// Main EDA Specification v1.0
export const EdaSpecV1Z = z.object({
  version: z.literal("1.0"),
  target: z.object({
    tool: z.enum(["kicad", "altium", "eagle"]).default("kicad"),
    version: z.string().default("8"),
  }),
  schematicRef: z.string().optional(), // Reference to schematic spec version
  
  components: z.array(EdaComponentZ),
  netClasses: z.array(NetClassZ),
  board: BoardZ,
  placement: z.array(PlacementZ).default([]),
  constraints: ConstraintsZ.optional(),
  manufacturing: ManufacturingZ.optional(),
  
  openQuestions: z.array(z.string()).default([]), // Issues to resolve
  metadata: z.record(z.any()).optional(),         // Tool-specific data
});

export type EdaSpecV1 = z.infer<typeof EdaSpecV1Z>;
export type EdaComponent = z.infer<typeof EdaComponentZ>;
export type NetClass = z.infer<typeof NetClassZ>;
export type Board = z.infer<typeof BoardZ>;
export type Placement = z.infer<typeof PlacementZ>;
export type Constraints = z.infer<typeof ConstraintsZ>;
export type Manufacturing = z.infer<typeof ManufacturingZ>;

/**
 * Validate EDA specification
 */
export function validateEdaSpec(spec: any): { ok: boolean; spec?: EdaSpecV1; errors?: string[] } {
  try {
    const validated = EdaSpecV1Z.parse(spec);
    return { ok: true, spec: validated };
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message];
    return { ok: false, errors };
  }
}

/**
 * Create minimal EDA spec from schematic spec
 */
export function createMinimalEdaSpec(schematicRef?: string): EdaSpecV1 {
  return {
    version: "1.0",
    target: { tool: "kicad", version: "8" },
    schematicRef,
    components: [],
    netClasses: [
      { name: "SIGNAL", track_mm: 0.25, clearance_mm: 0.127 },
      { name: "POWER", track_mm: 1.0, clearance_mm: 0.3 },
      { name: "GND", track_mm: 0.5, clearance_mm: 0.2 },
    ],
    board: {
      outline_mm: { width: 50, height: 40 },
      layers: 2,
      thickness_mm: 1.6,
      zones: [],
    },
    placement: [],
    openQuestions: [],
  };
}

/**
 * Get default net class for a net name
 */
export function getDefaultNetClass(netName: string): string {
  const name = netName.toLowerCase();
  
  if (name.includes("vcc") || name.includes("vdd") || name.includes("vbus") || 
      name.includes("5v") || name.includes("3v3") || name.includes("12v")) {
    return "POWER";
  }
  
  if (name.includes("gnd") || name.includes("ground")) {
    return "GND";
  }
  
  if (name.includes("usb") || name.includes("diff")) {
    return "USB";
  }
  
  return "SIGNAL";
}

/**
 * Estimate board size from component count
 */
export function estimateBoardSize(componentCount: number): { width: number; height: number } {
  // Simple heuristic: ~5mm² per component with 20% margin
  const area = componentCount * 5 * 1.2;
  const aspectRatio = 1.5; // 3:2 aspect ratio
  
  const width = Math.sqrt(area * aspectRatio);
  const height = area / width;
  
  // Round to 5mm increments, minimum 20x15mm
  return {
    width: Math.max(20, Math.round(width / 5) * 5),
    height: Math.max(15, Math.round(height / 5) * 5),
  };
}