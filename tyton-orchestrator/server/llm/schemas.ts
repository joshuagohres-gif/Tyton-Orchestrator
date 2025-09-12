// /server/llm/schemas.ts
import { z } from 'zod';

// Schema for LLM patch responses in EDA enrichment
export const LLMPatchResponseZ = z.object({
  patches: z.array(z.object({
    ref: z.string().min(1, "Component reference is required"),
    symbol: z.string().min(1, "Symbol is required"), 
    footprint: z.string().min(1, "Footprint is required"),
    confidence: z.number().min(0).max(1, "Confidence must be between 0 and 1"),
    notes: z.string().optional(),
    reasoning: z.string().optional().describe("Brief explanation of the assignment choice")
  })),
  metadata: z.object({
    total_components: z.number().min(0),
    resolved_count: z.number().min(0),
    avg_confidence: z.number().min(0).max(1),
    assignment_strategy: z.enum(["standard_library", "best_guess", "conservative"]).optional()
  }).optional()
});

export type LLMPatchResponse = z.infer<typeof LLMPatchResponseZ>;

// Schema for component library suggestions  
export const ComponentSuggestionZ = z.object({
  suggestions: z.array(z.object({
    ref: z.string(),
    component_type: z.string(),
    suggested_symbol: z.string(),
    suggested_footprint: z.string(),
    alternatives: z.array(z.object({
      symbol: z.string(),
      footprint: z.string(),
      confidence: z.number().min(0).max(1),
      use_case: z.string().optional()
    })).optional(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().optional()
  })),
  summary: z.object({
    total_suggestions: z.number(),
    high_confidence_count: z.number(),
    requires_review: z.array(z.string()).optional()
  }).optional()
});

export type ComponentSuggestion = z.infer<typeof ComponentSuggestionZ>;

// Schema for placement optimization responses
export const PlacementOptimizationZ = z.object({
  placement: z.array(z.object({
    ref: z.string(),
    x_mm: z.number(),
    y_mm: z.number(),
    rotation_deg: z.number().min(0).max(360),
    layer: z.enum(["top", "bottom"]),
    group: z.string().optional(),
    priority: z.enum(["critical", "high", "normal", "low"]).optional()
  })),
  groups: z.array(z.object({
    name: z.string(),
    components: z.array(z.string()),
    center_x_mm: z.number(),
    center_y_mm: z.number(),
    bounding_box: z.object({
      min_x: z.number(),
      min_y: z.number(),
      max_x: z.number(), 
      max_y: z.number()
    }).optional()
  })).optional(),
  routing_hints: z.array(z.object({
    net: z.string(),
    priority: z.enum(["critical", "high", "normal", "low"]),
    min_width_mm: z.number().optional(),
    keep_short: z.boolean().optional(),
    avoid_layers: z.array(z.string()).optional()
  })).optional(),
  optimization_notes: z.string().optional()
});

export type PlacementOptimization = z.infer<typeof PlacementOptimizationZ>;

// Schema for routing constraint generation
export const RoutingConstraintsZ = z.object({
  net_classes: z.array(z.object({
    name: z.string(),
    track_mm: z.number().positive(),
    clearance_mm: z.number().positive(),
    via_diam_mm: z.number().positive().optional(),
    via_drill_mm: z.number().positive().optional(),
    nets: z.array(z.string())
  })),
  constraints: z.object({
    high_current_nets: z.array(z.object({
      net: z.string(),
      min_track_mm: z.number().positive(),
      thermal_considerations: z.string().optional()
    })).optional(),
    differential_pairs: z.array(z.object({
      name: z.string(),
      p_net: z.string(),
      n_net: z.string(),
      impedance_ohm: z.number().positive(),
      tolerance_percent: z.number().positive().optional()
    })).optional(),
    length_matching: z.array(z.object({
      group: z.string(),
      nets: z.array(z.string()),
      tolerance_mm: z.number().positive(),
      target_length_mm: z.number().positive().optional()
    })).optional(),
    keepouts: z.array(z.object({
      ref: z.string(),
      radius_mm: z.number().positive(),
      reason: z.string()
    })).optional()
  }).optional(),
  validation_notes: z.array(z.string()).optional()
});

export type RoutingConstraints = z.infer<typeof RoutingConstraintsZ>;

// Schema for design rule optimization
export const DesignRuleOptimizationZ = z.object({
  rules: z.object({
    min_track_width_mm: z.number().positive(),
    min_via_size_mm: z.number().positive(),
    min_clearance_mm: z.number().positive(),
    min_drill_size_mm: z.number().positive(),
    max_aspect_ratio: z.number().positive().optional()
  }),
  layer_stackup: z.array(z.object({
    layer: z.string(),
    type: z.enum(["signal", "power", "ground", "mixed"]),
    thickness_um: z.number().positive(),
    material: z.string().optional(),
    impedance_target_ohm: z.number().positive().optional()
  })).optional(),
  manufacturing: z.object({
    fab_house: z.string().optional(),
    min_feature_size_um: z.number().positive(),
    tolerance_class: z.enum(["standard", "precision", "high_precision"]).optional(),
    finish: z.enum(["HASL", "ENIG", "OSP", "ImSn", "ImAg"]).optional(),
    thickness_mm: z.number().positive().optional()
  }).optional(),
  cost_optimization: z.object({
    estimated_cost_usd: z.number().positive().optional(),
    cost_drivers: z.array(z.string()).optional(),
    cost_reduction_suggestions: z.array(z.string()).optional()
  }).optional()
});

export type DesignRuleOptimization = z.infer<typeof DesignRuleOptimizationZ>;

// Generic error response schema for LLM calls
export const LLMErrorResponseZ = z.object({
  error: z.string(),
  error_code: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  retry_recommended: z.boolean().optional()
});

export type LLMErrorResponse = z.infer<typeof LLMErrorResponseZ>;

// Union type for all possible LLM response schemas
export const AllLLMSchemasZ = z.union([
  LLMPatchResponseZ,
  ComponentSuggestionZ, 
  PlacementOptimizationZ,
  RoutingConstraintsZ,
  DesignRuleOptimizationZ,
  LLMErrorResponseZ
]);

// Schema validation helper
export function validateLLMResponse<T>(data: unknown, schema: z.ZodSchema<T>): { 
  success: boolean; 
  data?: T; 
  errors?: string[] 
} {
  try {
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