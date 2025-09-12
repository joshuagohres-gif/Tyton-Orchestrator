// /tests/llm/schemas.test.ts
import { describe, it, expect } from 'vitest';
import { 
  LLMPatchResponseZ, 
  ComponentSuggestionZ,
  PlacementOptimizationZ,
  RoutingConstraintsZ,
  validateLLMResponse 
} from '@/server/llm/schemas';

describe('LLM Schemas', () => {
  describe('LLMPatchResponseZ', () => {
    it('should validate correct patch response', () => {
      const validResponse = {
        patches: [
          {
            ref: "R1",
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 0.9,
            notes: "Standard 0603 resistor",
            reasoning: "Common SMD package for this application"
          }
        ],
        metadata: {
          total_components: 1,
          resolved_count: 1,
          avg_confidence: 0.9,
          assignment_strategy: "standard_library"
        }
      };

      const result = validateLLMResponse(validResponse, LLMPatchResponseZ);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(validResponse);
    });

    it('should reject invalid confidence values', () => {
      const invalidResponse = {
        patches: [
          {
            ref: "R1",
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 1.5, // Invalid: > 1
          }
        ]
      };

      const result = validateLLMResponse(invalidResponse, LLMPatchResponseZ);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('confidence');
    });

    it('should require minimum required fields', () => {
      const invalidResponse = {
        patches: [
          {
            ref: "",  // Invalid: empty string
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 0.9
          }
        ]
      };

      const result = validateLLMResponse(invalidResponse, LLMPatchResponseZ);
      expect(result.success).toBe(false);
    });
  });

  describe('ComponentSuggestionZ', () => {
    it('should validate component suggestions', () => {
      const validSuggestion = {
        suggestions: [
          {
            ref: "U1",
            component_type: "Microcontroller",
            suggested_symbol: "MCU_ST_STM32F1:STM32F103C8Tx",
            suggested_footprint: "Package_QFP:LQFP-48_7x7mm_P0.5mm",
            confidence: 0.95,
            rationale: "Popular MCU for this application"
          }
        ],
        summary: {
          total_suggestions: 1,
          high_confidence_count: 1
        }
      };

      const result = validateLLMResponse(validSuggestion, ComponentSuggestionZ);
      expect(result.success).toBe(true);
    });
  });

  describe('PlacementOptimizationZ', () => {
    it('should validate placement data', () => {
      const validPlacement = {
        placement: [
          {
            ref: "U1",
            x_mm: 25.4,
            y_mm: 12.7,
            rotation_deg: 0,
            layer: "top",
            group: "MCU",
            priority: "critical"
          }
        ],
        groups: [
          {
            name: "MCU",
            components: ["U1"],
            center_x_mm: 25.4,
            center_y_mm: 12.7
          }
        ]
      };

      const result = validateLLMResponse(validPlacement, PlacementOptimizationZ);
      expect(result.success).toBe(true);
    });

    it('should reject invalid rotation angles', () => {
      const invalidPlacement = {
        placement: [
          {
            ref: "U1",
            x_mm: 25.4,
            y_mm: 12.7,
            rotation_deg: 450, // Invalid: > 360
            layer: "top"
          }
        ]
      };

      const result = validateLLMResponse(invalidPlacement, PlacementOptimizationZ);
      expect(result.success).toBe(false);
    });
  });

  describe('RoutingConstraintsZ', () => {
    it('should validate routing constraints', () => {
      const validConstraints = {
        net_classes: [
          {
            name: "Power",
            track_mm: 0.5,
            clearance_mm: 0.2,
            via_diam_mm: 0.8,
            via_drill_mm: 0.4,
            nets: ["VCC", "VDD"]
          }
        ],
        constraints: {
          high_current_nets: [
            {
              net: "VCC",
              min_track_mm: 0.5
            }
          ]
        }
      };

      const result = validateLLMResponse(validConstraints, RoutingConstraintsZ);
      expect(result.success).toBe(true);
    });

    it('should reject negative track widths', () => {
      const invalidConstraints = {
        net_classes: [
          {
            name: "Power",
            track_mm: -0.1, // Invalid: negative
            clearance_mm: 0.2,
            nets: ["VCC"]
          }
        ]
      };

      const result = validateLLMResponse(invalidConstraints, RoutingConstraintsZ);
      expect(result.success).toBe(false);
    });
  });

  describe('validateLLMResponse helper', () => {
    it('should handle non-ZodError exceptions', () => {
      const invalidData = null;
      const result = validateLLMResponse(invalidData, LLMPatchResponseZ);
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should provide detailed error paths', () => {
      const invalidResponse = {
        patches: [
          {
            // Missing required fields
          }
        ]
      };

      const result = validateLLMResponse(invalidResponse, LLMPatchResponseZ);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      // Should have path information
      expect(result.errors!.some(err => err.includes('patches.0'))).toBe(true);
    });
  });
});