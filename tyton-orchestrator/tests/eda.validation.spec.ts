// /tests/eda.validation.spec.ts
import { describe, it, expect } from "vitest";
import { 
  validateEdaSpec, 
  validateLLMPatches, 
  validateComponentAttributes,
  sanitizeString 
} from "@/server/services/eda/validateEda";
import type { EdaSpecV1 } from "@/server/services/eda/spec";

describe("EDA validation", () => {
  const validEdaSpec: EdaSpecV1 = {
    version: "1.0",
    target: { tool: "kicad", version: "8" },
    schematicRef: "v1.2",
    components: [
      { ref: "R1", value: "10k", role: "Resistor", symbol: "Device:R_Small", footprint: "Resistor_SMD:R_0603_1608Metric" }
    ],
    netClasses: [
      { name: "SIGNAL", track_mm: 0.25, clearance_mm: 0.127 }
    ],
    board: {
      outline_mm: { width: 50, height: 40 },
      layers: 2
    },
    placement: [
      { ref: "R1", x_mm: 10, y_mm: 10 }
    ]
  };

  describe("validateEdaSpec", () => {
    it("accepts valid EDA spec", () => {
      const result = validateEdaSpec(validEdaSpec);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.spec).toEqual(validEdaSpec);
    });

    it("detects orphaned placement entries", () => {
      const invalidSpec = {
        ...validEdaSpec,
        placement: [
          { ref: "R1", x_mm: 10, y_mm: 10 },
          { ref: "C1", x_mm: 20, y_mm: 20 } // C1 doesn't exist in components
        ]
      };

      const result = validateEdaSpec(invalidSpec);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Placement references non-existent component: C1/);
    });

    it("detects components without placement", () => {
      const invalidSpec = {
        ...validEdaSpec,
        components: [
          ...validEdaSpec.components,
          { ref: "C1", value: "100nF", role: "Capacitor" } // C1 has no placement
        ]
      };

      const result = validateEdaSpec(invalidSpec);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Component C1 has no placement entry/);
    });

    it("validates board dimensions are reasonable", () => {
      const invalidSpec = {
        ...validEdaSpec,
        board: {
          outline_mm: { width: 2000, height: 0.5 }, // Too large width, too small height
          layers: 2
        }
      };

      const result = validateEdaSpec(invalidSpec);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("Board width 2000mm is outside reasonable range (1-1000mm)");
      expect(result.errors).toContain("Board height 0.5mm is outside reasonable range (1-1000mm)");
    });

    it("validates track widths are reasonable", () => {
      const invalidSpec = {
        ...validEdaSpec,
        netClasses: [
          { name: "POWER", track_mm: 100, clearance_mm: 0.01 } // Too large track, too small clearance
        ]
      };

      const result = validateEdaSpec(invalidSpec);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("Net class POWER track width 100mm is outside reasonable range");
      expect(result.errors).toContain("Net class POWER clearance 0.01mm is outside reasonable range");
    });
  });

  describe("validateLLMPatches", () => {
    it("accepts valid patches", () => {
      const patches = {
        patches: [
          {
            ref: "R1",
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 0.9,
            notes: "Standard resistor assignment"
          }
        ]
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(true);
      expect(result.patches).toHaveLength(1);
      expect(result.patches![0].ref).toBe("R1");
    });

    it("accepts TBD values", () => {
      const patches = {
        patches: [
          {
            ref: "U1",
            symbol: "TBD",
            footprint: "TBD",
            confidence: 0.1,
            notes: "Unknown component"
          }
        ]
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(true);
    });

    it("rejects invalid component references", () => {
      const patches = {
        patches: [
          {
            ref: "invalid_ref", // Should be like R1, C2, U3
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 0.9
          }
        ]
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Component ref must follow format/);
    });

    it("rejects symbols/footprints without library prefix", () => {
      const patches = {
        patches: [
          {
            ref: "R1",
            symbol: "R_Small", // Missing "Device:" prefix
            footprint: "R_0603_1608Metric", // Missing "Resistor_SMD:" prefix
            confidence: 0.9
          }
        ]
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("patches.0.symbol: Symbol must be 'TBD' or include library prefix (e.g. 'Device:R_Small')");
      expect(result.errors).toContain("patches.0.footprint: Footprint must be 'TBD' or include library prefix (e.g. 'Resistor_SMD:R_0603_1608Metric')");
    });

    it("rejects confidence outside 0-1 range", () => {
      const patches = {
        patches: [
          {
            ref: "R1",
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 1.5 // Invalid: > 1
          }
        ]
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Number must be less than or equal to 1/);
    });

    it("detects duplicate component references", () => {
      const patches = {
        patches: [
          {
            ref: "R1",
            symbol: "Device:R_Small",
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 0.9
          },
          {
            ref: "R1", // Duplicate!
            symbol: "Device:R",
            footprint: "Resistor_SMD:R_0805_2012Metric",
            confidence: 0.8
          }
        ]
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Duplicate component references in patches: R1/);
    });

    it("detects suspicious content patterns", () => {
      const patches = {
        patches: [
          {
            ref: "R1",
            symbol: "javascript:alert('xss')", // Suspicious pattern
            footprint: "Resistor_SMD:R_0603_1608Metric",
            confidence: 0.9
          }
        ]
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Suspicious content detected in patch for R1/);
    });

    it("enforces maximum patch count", () => {
      const patches = {
        patches: new Array(1001).fill(null).map((_, i) => ({
          ref: `R${i + 1}`,
          symbol: "Device:R_Small",
          footprint: "Resistor_SMD:R_0603_1608Metric",
          confidence: 0.9
        }))
      };

      const result = validateLLMPatches(patches);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Array must contain at most 1000 element/);
    });
  });

  describe("validateComponentAttributes", () => {
    it("accepts valid attributes", () => {
      const attributes = {
        pins: 8,
        pitch_mm: 2.54,
        mapping_confidence: 0.95,
        mapping_source: "db",
        custom_field: "value"
      };

      const result = validateComponentAttributes(attributes);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("accepts null/undefined attributes", () => {
      expect(validateComponentAttributes(null).ok).toBe(true);
      expect(validateComponentAttributes(undefined).ok).toBe(true);
      expect(validateComponentAttributes({}).ok).toBe(true);
    });

    it("rejects oversized attribute objects", () => {
      const largeAttributes = {
        data: "x".repeat(15000) // > 10000 chars when JSON stringified
      };

      const result = validateComponentAttributes(largeAttributes);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/Component attributes exceed maximum size limit/);
    });

    it("validates pins attribute", () => {
      const invalidPins = [
        { pins: 0 },
        { pins: -5 },
        { pins: 1001 },
        { pins: "8" }
      ];

      for (const attrs of invalidPins) {
        const result = validateComponentAttributes(attrs);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/Component pins attribute must be a number between 1 and 1000/);
      }
    });

    it("validates pitch_mm attribute", () => {
      const invalidPitch = [
        { pitch_mm: 0 },
        { pitch_mm: -1 },
        { pitch_mm: 101 },
        { pitch_mm: "2.54" }
      ];

      for (const attrs of invalidPitch) {
        const result = validateComponentAttributes(attrs);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/Component pitch_mm must be a positive number ≤ 100/);
      }
    });

    it("validates mapping_confidence attribute", () => {
      const invalidConfidence = [
        { mapping_confidence: -0.1 },
        { mapping_confidence: 1.1 },
        { mapping_confidence: "0.5" }
      ];

      for (const attrs of invalidConfidence) {
        const result = validateComponentAttributes(attrs);
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/Component mapping_confidence must be a number between 0 and 1/);
      }
    });
  });

  describe("sanitizeString", () => {
    it("removes dangerous characters", () => {
      const input = `<script>alert('xss')</script>"dangerous"&amp;`;
      const result = sanitizeString(input);
      expect(result).toBe(`scriptalert('xss')/scriptdangerous`);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain('&');
    });

    it("trims whitespace", () => {
      const input = "  whitespace  ";
      const result = sanitizeString(input);
      expect(result).toBe("whitespace");
    });

    it("respects maxLength parameter", () => {
      const input = "a".repeat(200);
      const result = sanitizeString(input, 50);
      expect(result).toHaveLength(50);
      expect(result).toBe("a".repeat(50));
    });

    it("handles empty and undefined input", () => {
      expect(sanitizeString("")).toBe("");
      expect(sanitizeString("   ")).toBe("");
    });
  });
});