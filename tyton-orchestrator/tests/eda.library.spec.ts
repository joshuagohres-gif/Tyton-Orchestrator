// /tests/eda.library.spec.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { suggestLibraries, applySuggestions } from "@/server/services/eda/libraryLookup";
import { getLibraryByMpns } from "@/server/services/eda/libraryService";
import type { EdaSpecV1 } from "@/server/services/eda/spec";

// Mock the library service
vi.mock("@/server/services/eda/libraryService", () => ({
  getLibraryByMpns: vi.fn()
}));

describe("library lookup", () => {
  beforeEach(() => {
    // Mock empty database response by default
    vi.mocked(getLibraryByMpns).mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });
  it("maps ESP32-WROOM-32", () => {
    const res = suggestLibraries({
      ref: "U1", mpn: "ESP32-WROOM-32", role: "MCU", refPrefix: "U"
    });
    expect(res.symbol).toMatch(/ESP32-WROOM-32/);
    expect(res.footprint).toMatch(/ESP32-WROOM-32/);
    expect(res.confidence).toBeGreaterThan(0.9);
  });

  it("maps AP2112K-3.3 regulator", () => {
    const res = suggestLibraries({
      ref: "U3", value: "AP2112K-3.3", role: "Regulator", refPrefix: "U"
    });
    expect(res.symbol).toMatch(/AP2112K/);
    expect(res.footprint).toMatch(/SOT-23-5/);
  });

  it("maps 1x6 2.54 header", () => {
    const res = suggestLibraries({
      ref: "J2", value: "PinHeader 1x6", role: "Connector", refPrefix: "J", pins: 6, pitchMm: 2.54
    });
    expect(res.footprint).toMatch(/PinHeader_1x6_P2\.54mm_Vertical/);
  });

  it("maps JST-PH connector", () => {
    const res = suggestLibraries({
      ref: "J1", value: "JST-PH", role: "Connector", refPrefix: "J", pins: 4, pitchMm: 2.0
    });
    expect(res.footprint).toMatch(/JST_PH.*4.*P2\.00mm/);
    expect(res.symbol).toMatch(/Conn_01x4/);
  });

  it("maps 0603 resistor", () => {
    const res = suggestLibraries({
      ref: "R1", value: "10k", role: "Resistor", refPrefix: "R"
    });
    expect(res.symbol).toBe("Device:R_Small");
    expect(res.footprint).toMatch(/R_0603_1608Metric/);
    expect(res.confidence).toBeGreaterThan(0.85);
  });

  it("maps 0603 capacitor", () => {
    const res = suggestLibraries({
      ref: "C5", value: "100nF", role: "Capacitor", refPrefix: "C"
    });
    expect(res.symbol).toBe("Device:C_Small");
    expect(res.footprint).toMatch(/C_0603_1608Metric/);
  });

  it("maps LED", () => {
    const res = suggestLibraries({
      ref: "D1", value: "LED Red", role: "LED", refPrefix: "D"
    });
    expect(res.symbol).toBe("Device:LED");
    expect(res.footprint).toMatch(/LED_0603_1608Metric/);
  });

  it("maps USB-C connector", () => {
    const res = suggestLibraries({
      ref: "J1", value: "USB-C", role: "Connector", refPrefix: "J"
    });
    expect(res.symbol).toMatch(/USB_C_Receptacle/);
    expect(res.footprint).toMatch(/USB_C_Receptacle/);
  });

  it("maps crystal oscillator", () => {
    const res = suggestLibraries({
      ref: "Y1", value: "16MHz", role: "Crystal", refPrefix: "Y"
    });
    expect(res.symbol).toMatch(/Crystal/);
    expect(res.footprint).toMatch(/Crystal_SMD_3225/);
  });

  it("maps BME280 sensor", () => {
    const res = suggestLibraries({
      ref: "U2", mpn: "BME280", role: "Sensor", refPrefix: "U"
    });
    expect(res.symbol).toMatch(/BME280/);
    expect(res.footprint).toMatch(/Bosch_LGA-8/);
  });

  it("returns TBD when no rule matches", () => {
    const res = suggestLibraries({ ref: "Q1", value: "MysteryPart", refPrefix: "Q" });
    expect(res.symbol).toBe("TBD");
    expect(res.footprint).toBe("TBD");
    expect(res.confidence).toBe(0);
  });

  it("resolves connector pin count dynamically", () => {
    const res = suggestLibraries({
      ref: "J3", value: "Header", role: "Connector", refPrefix: "J", pins: 8, pitchMm: 2.54
    });
    expect(res.symbol).toBe("Connector_Generic:Conn_01x8");
    expect(res.footprint).toMatch(/PinHeader_1x8_P2\.54mm/);
  });

  describe("applySuggestions", () => {
    const mockEdaSpec: EdaSpecV1 = {
      version: "1.0",
      target: { tool: "kicad", version: "8" },
      schematicRef: "v1.2",
      components: [
        { ref: "U1", mpn: "ESP32-WROOM-32", role: "MCU" },
        { ref: "R1", value: "10k", role: "Resistor" },
        { ref: "C1", value: "100nF", role: "Capacitor" },
        { ref: "J1", value: "USB-C", role: "Connector" },
      ],
      netClasses: [
        { name: "SIGNAL", track_mm: 0.25, clearance_mm: 0.127 }
      ],
      board: {
        outline_mm: { width: 50, height: 40 },
        layers: 2
      },
      placement: []
    };

    it("applies suggestions to all components", async () => {
      const result = await applySuggestions(mockEdaSpec, { preserveExisting: false });
      
      expect(result.changes).toBeGreaterThan(0);
      expect(result.eda.components[0].symbol).toMatch(/ESP32-WROOM-32/);
      expect(result.eda.components[1].symbol).toBe("Device:R_Small");
      expect(result.eda.components[2].symbol).toBe("Device:C_Small");
      expect(result.eda.components[3].symbol).toMatch(/USB_C_Receptacle/);
    });

    it("preserves existing assignments when preserveExisting=true", async () => {
      const specWithExisting = {
        ...mockEdaSpec,
        components: [
          { ref: "U1", mpn: "ESP32-WROOM-32", role: "MCU", symbol: "Custom:MySymbol", footprint: "Custom:MyFootprint" },
          { ref: "R1", value: "10k", role: "Resistor" },
        ]
      };

      const result = await applySuggestions(specWithExisting, { preserveExisting: true });
      
      expect(result.eda.components[0].symbol).toBe("Custom:MySymbol");
      expect(result.eda.components[0].footprint).toBe("Custom:MyFootprint");
      expect(result.eda.components[1].symbol).toBe("Device:R_Small");
    });

    it("counts TBD assignments correctly", async () => {
      const specWithUnknown = {
        ...mockEdaSpec,
        components: [
          { ref: "Q1", value: "UnknownTransistor", role: "Transistor" },
          { ref: "U2", mpn: "CustomIC", role: "IC" },
        ]
      };

      const result = await applySuggestions(specWithUnknown);
      
      expect(result.tbd).toBe(2); // Both components should be TBD
      expect(result.eda.components[0].symbol).toBe("TBD");
      expect(result.eda.components[1].footprint).toBe("TBD");
      expect(result.unresolved).toHaveLength(2);
    });

    it("adds mapping notes for TBD components", async () => {
      const specWithUnknown = {
        ...mockEdaSpec,
        components: [
          { ref: "Q1", value: "UnknownPart", role: "Unknown" }
        ]
      };

      const result = await applySuggestions(specWithUnknown);
      
      expect(result.eda.components[0].attributes?.mapping_notes).toBeDefined();
      expect(result.eda.components[0].attributes?.mapping_notes[0]).toMatch(/Add exact MPN/);
      expect(result.unresolved[0].ref).toBe("Q1");
    });
  });

  describe("edge cases", () => {
    it("handles missing optional fields gracefully", () => {
      const res = suggestLibraries({ ref: "R1", refPrefix: "R" });
      expect(res.symbol).toBeDefined();
      expect(res.footprint).toBeDefined();
    });

    it("handles empty strings", () => {
      const res = suggestLibraries({ ref: "C1", value: "", mpn: "", role: "", refPrefix: "C" });
      expect(res.symbol).toBeDefined();
      expect(res.footprint).toBeDefined();
    });

    it("matches case-insensitively", () => {
      const res1 = suggestLibraries({ ref: "U1", mpn: "esp32-wroom-32", role: "mcu", refPrefix: "U" });
      const res2 = suggestLibraries({ ref: "U1", mpn: "ESP32-WROOM-32", role: "MCU", refPrefix: "U" });
      
      expect(res1.symbol).toBe(res2.symbol);
      expect(res1.footprint).toBe(res2.footprint);
    });

    it("handles pitch matching with tolerance", () => {
      const res1 = suggestLibraries({ ref: "J1", value: "Header", refPrefix: "J", pins: 4, pitchMm: 2.54 });
      const res2 = suggestLibraries({ ref: "J1", value: "Header", refPrefix: "J", pins: 4, pitchMm: 2.53 });
      
      expect(res1.symbol).toBe(res2.symbol); // Should match within tolerance
    });
  });

  describe("DB-first integration", () => {
    it("prioritizes exact DB matches over heuristics", async () => {
      // Mock database with exact MPN match
      vi.mocked(getLibraryByMpns).mockResolvedValue(new Map([
        ["ESP32-WROOM-32", {
          id: "1",
          mpn: "ESP32-WROOM-32",
          symbol: "RF_Module:ESP32-WROOM-32",
          footprint: "RF_Module:ESP32-WROOM-32",
          meta: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }]
      ]));

      const spec: EdaSpecV1 = {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { ref: "U1", mpn: "ESP32-WROOM-32", role: "MCU" }
        ],
        netClasses: [{ name: "SIGNAL", track_mm: 0.25, clearance_mm: 0.127 }],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: []
      };

      const result = await applySuggestions(spec);
      
      expect(result.dbHits).toBe(1);
      expect(result.heuristicHits).toBe(0);
      expect(result.eda.components[0].symbol).toBe("RF_Module:ESP32-WROOM-32");
      expect(result.eda.components[0].attributes?.mapping_source).toBe("db");
      expect(result.eda.components[0].attributes?.mapping_confidence).toBe(1.0);
    });

    it("falls back to heuristics when no DB match", async () => {
      // Mock empty database
      vi.mocked(getLibraryByMpns).mockResolvedValue(new Map());

      const spec: EdaSpecV1 = {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { ref: "R1", value: "10k", role: "Resistor" }
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: []
      };

      const result = await applySuggestions(spec);
      
      expect(result.dbHits).toBe(0);
      expect(result.heuristicHits).toBe(1);
      expect(result.eda.components[0].symbol).toBe("Device:R_Small");
      expect(result.eda.components[0].attributes?.mapping_source).toBe("heuristic");
    });

    it("tracks unresolved components for LLM processing", async () => {
      vi.mocked(getLibraryByMpns).mockResolvedValue(new Map());

      const spec: EdaSpecV1 = {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { ref: "U1", mpn: "UnknownIC", value: "CustomChip", role: "IC" },
          { ref: "Q1", value: "UnknownTransistor", role: "Transistor" }
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: []
      };

      const result = await applySuggestions(spec);
      
      expect(result.unresolved).toHaveLength(2);
      expect(result.unresolved[0]).toEqual({
        ref: "U1",
        mpn: "UnknownIC",
        value: "CustomChip",
        role: "IC",
        hints: ["MPN: UnknownIC", "Value: CustomChip", "Role: IC"]
      });
      expect(result.unresolved[1]).toEqual({
        ref: "Q1",
        mpn: undefined,
        value: "UnknownTransistor",
        role: "Transistor",
        hints: ["Value: UnknownTransistor", "Role: Transistor"]
      });
    });

    it("preserves manual edits (manualEdited=true)", async () => {
      vi.mocked(getLibraryByMpns).mockResolvedValue(new Map([
        ["ESP32-WROOM-32", {
          id: "1",
          mpn: "ESP32-WROOM-32",
          symbol: "RF_Module:ESP32-WROOM-32", 
          footprint: "RF_Module:ESP32-WROOM-32",
          meta: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }]
      ]));

      const spec: EdaSpecV1 = {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { 
            ref: "U1", 
            mpn: "ESP32-WROOM-32", 
            role: "MCU",
            symbol: "Custom:ESP32",
            footprint: "Custom:ESP32_Footprint",
            attributes: { manualEdited: true }
          }
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: []
      };

      const result = await applySuggestions(spec);
      
      expect(result.changes).toBe(0);
      expect(result.eda.components[0].symbol).toBe("Custom:ESP32");
      expect(result.eda.components[0].footprint).toBe("Custom:ESP32_Footprint");
    });

    it("respects confidence threshold for heuristic rules", async () => {
      vi.mocked(getLibraryByMpns).mockResolvedValue(new Map());

      const spec: EdaSpecV1 = {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { ref: "R1", value: "10k", role: "Resistor" } // High confidence match
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: []
      };

      // Test with high confidence threshold
      const result = await applySuggestions(spec, { minHeuristicConfidence: 0.95 });
      
      expect(result.heuristicHits).toBe(1); // Should still match as resistor has high confidence
      expect(result.eda.components[0].symbol).toBe("Device:R_Small");
    });

    it("handles mixed DB hits and heuristic matches", async () => {
      vi.mocked(getLibraryByMpns).mockResolvedValue(new Map([
        ["ESP32-WROOM-32", {
          id: "1",
          mpn: "ESP32-WROOM-32",
          symbol: "RF_Module:ESP32-WROOM-32",
          footprint: "RF_Module:ESP32-WROOM-32",
          meta: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }]
      ]));

      const spec: EdaSpecV1 = {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { ref: "U1", mpn: "ESP32-WROOM-32", role: "MCU" }, // DB match
          { ref: "R1", value: "10k", role: "Resistor" }, // Heuristic match
          { ref: "Q1", value: "Unknown", role: "Transistor" } // Unresolved
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: []
      };

      const result = await applySuggestions(spec);
      
      expect(result.dbHits).toBe(1);
      expect(result.heuristicHits).toBe(1);
      expect(result.unresolved).toHaveLength(1);
      expect(result.changes).toBe(2); // U1 and R1 got assigned
      expect(result.tbd).toBe(1); // Q1 remains TBD
    });
  });
});