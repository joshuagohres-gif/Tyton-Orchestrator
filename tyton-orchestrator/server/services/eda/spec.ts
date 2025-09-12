import { z } from "zod";

export const EdaComponentZ = z.object({
  ref: z.string(),
  mpn: z.string().optional(),
  value: z.string().optional(),
  role: z.string().optional(),
  symbol: z.string().optional(),      // KiCad symbol, e.g., "Device:R_Small"
  footprint: z.string().optional(),   // KiCad footprint, e.g., "Resistor_SMD:R_0603_1608Metric"
  orientation_deg: z.number().optional(),
  attributes: z.record(z.any()).optional(),
});

export const EdaNetClassZ = z.object({
  name: z.string(),
  track_mm: z.number(),
  clearance_mm: z.number(),
  via_diam_mm: z.number().optional(),
  via_drill_mm: z.number().optional(),
});

export const EdaSpecZ = z.object({
  version: z.literal("1.0"),
  target: z.object({ tool: z.literal("kicad"), version: z.enum(["7","8"]) }),
  schematicRef: z.literal("v1.2"),
  components: z.array(EdaComponentZ),
  netClasses: z.array(EdaNetClassZ),
  diffPairs: z.array(z.object({
    pos: z.string(), neg: z.string(),
    class: z.string().optional(),
    match_tol_mm: z.number().optional()
  })).optional(),
  board: z.object({
    outline_mm: z.object({ width: z.number(), height: z.number(), corner_radius: z.number().optional() }),
    layers: z.union([z.literal(2), z.literal(4)]),
    stackup: z.enum(["std-2L","std-4L"]).optional(),
    keepouts: z.array(z.object({ x:z.number(), y:z.number(), w:z.number(), h:z.number(), reason:z.string().optional() })).optional(),
    zones: z.array(z.object({ net: z.string(), layer: z.enum(["F.Cu","B.Cu"]), clearance_mm: z.number().optional() })).optional(),
  }),
  placement: z.array(z.object({
    ref: z.string(), x_mm: z.number(), y_mm: z.number(), rot_deg: z.number().optional(), group: z.string().optional()
  })),
  constraints: z.object({
    high_current_nets: z.array(z.object({ net:z.string(), min_track_mm:z.number() })).optional(),
    antenna_keepouts: z.array(z.object({ ref:z.string(), radius_mm:z.number() })).optional(),
    analog_islands: z.array(z.string()).optional()
  }).optional(),
  manufacturing: z.object({
    fab: z.string().optional(),
    thickness_mm: z.number().optional(),
    min_track_mm: z.number().optional(),
    min_clearance_mm: z.number().optional(),
    finish: z.string().optional(),
  }).optional(),
  bomOverrides: z.array(z.object({ ref:z.string(), alt_mpns:z.array(z.string())})).optional(),
  openQuestions: z.array(z.string()).optional(),
}).strict();

export type EdaSpecV1 = z.infer<typeof EdaSpecZ>;