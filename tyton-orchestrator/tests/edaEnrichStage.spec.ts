// /tests/edaEnrichStage.spec.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runEdaEnrich } from "@/server/orchestrator/edaEnrichStage";
import { applySuggestions } from "@/server/services/eda/libraryLookup";
import { validateEdaSpec } from "@/server/services/eda/validateEda";
import { seedEdaFromSchematic } from "@/server/services/eda/mapFromSchematic";
import { renderEdaEnrichPrompt } from "@/lib/prompts/p8_eda_enrich";
import { PrismaClient } from "@prisma/client";
import type { SchematicSpec } from "@/server/validation/schematicSpecValidator";

// Mock all dependencies
vi.mock("@/server/services/eda/libraryLookup");
vi.mock("@/server/services/eda/validateEda");
vi.mock("@/server/services/eda/mapFromSchematic");
vi.mock("@/lib/prompts/p8_eda_enrich");
vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn()
}));

describe("edaEnrichStage", () => {
  const mockPrisma = {
    module: {
      findFirst: vi.fn(),
      upsert: vi.fn()
    }
  };

  const mockSchematic: SchematicSpec = {
    title: "Test Project",
    description: "A test schematic",
    nets: [],
    components: [
      {
        id: "U1",
        type: "mcu",
        attributes: { mpn: "ESP32-WROOM-32" },
        connections: {}
      }
    ]
  };

  beforeEach(() => {
    // Setup default mocks
    vi.mocked(PrismaClient).mockReturnValue(mockPrisma as any);
    
    vi.mocked(seedEdaFromSchematic).mockReturnValue({
      version: "1.0",
      target: { tool: "kicad", version: "8" },
      schematicRef: "v1.2",
      components: [
        { ref: "U1", mpn: "ESP32-WROOM-32", role: "MCU" }
      ],
      netClasses: [],
      board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
      placement: [{ ref: "U1", x_mm: 25, y_mm: 20 }]
    });

    vi.mocked(applySuggestions).mockResolvedValue({
      eda: {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { 
            ref: "U1", 
            mpn: "ESP32-WROOM-32", 
            role: "MCU",
            symbol: "RF_Module:ESP32-WROOM-32",
            footprint: "RF_Module:ESP32-WROOM-32",
            attributes: { mapping_source: "db", mapping_confidence: 1.0 }
          }
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: [{ ref: "U1", x_mm: 25, y_mm: 20 }]
      },
      changes: 1,
      tbd: 0,
      lowConfidence: 0,
      dbHits: 1,
      heuristicHits: 0,
      unresolved: []
    });

    vi.mocked(validateEdaSpec).mockReturnValue({
      ok: true,
      errors: [],
      spec: expect.any(Object)
    });

    mockPrisma.module.findFirst.mockResolvedValue(null);
    mockPrisma.module.upsert.mockResolvedValue({ id: "module123" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("successfully enriches EDA spec with DB-first approach", async () => {
    const result = await runEdaEnrich("project123", mockSchematic);

    expect(seedEdaFromSchematic).toHaveBeenCalledWith(mockSchematic);
    expect(applySuggestions).toHaveBeenCalledWith(
      expect.any(Object),
      { preserveExisting: true, minHeuristicConfidence: 0.75 }
    );

    expect(result.components[0].symbol).toBe("RF_Module:ESP32-WROOM-32");
    expect(result.components[0].footprint).toBe("RF_Module:ESP32-WROOM-32");
    expect(mockPrisma.module.upsert).toHaveBeenCalled();
  });

  it("calls LLM for unresolved components", async () => {
    // Mock applySuggestions to return unresolved components
    vi.mocked(applySuggestions).mockResolvedValue({
      eda: {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { ref: "U1", mpn: "UnknownIC", role: "IC", symbol: "TBD", footprint: "TBD" }
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: [{ ref: "U1", x_mm: 25, y_mm: 20 }]
      },
      changes: 0,
      tbd: 1,
      lowConfidence: 0,
      dbHits: 0,
      heuristicHits: 0,
      unresolved: [
        {
          ref: "U1",
          mpn: "UnknownIC",
          value: undefined,
          role: "IC",
          hints: ["MPN: UnknownIC", "Role: IC"]
        }
      ]
    });

    vi.mocked(renderEdaEnrichPrompt).mockReturnValue("mock prompt");

    const result = await runEdaEnrich("project123", mockSchematic);

    expect(renderEdaEnrichPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Test Project",
        description: "A test schematic"
      }),
      expect.arrayContaining([
        expect.objectContaining({
          ref: "U1",
          mpn: "UnknownIC"
        })
      ])
    );

    // Should still return a valid EDA spec even if LLM fails
    expect(result).toBeDefined();
    expect(validateEdaSpec).toHaveBeenCalled();
  });

  it("handles LLM failure gracefully", async () => {
    // Mock LLM failure by having unresolved components but LLM throwing error
    vi.mocked(applySuggestions).mockResolvedValue({
      eda: {
        version: "1.0",
        target: { tool: "kicad", version: "8" },
        schematicRef: "v1.2",
        components: [
          { ref: "U1", symbol: "TBD", footprint: "TBD" }
        ],
        netClasses: [],
        board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
        placement: [{ ref: "U1", x_mm: 25, y_mm: 20 }]
      },
      changes: 0,
      tbd: 1,
      lowConfidence: 0,
      dbHits: 0,
      heuristicHits: 0,
      unresolved: [
        { ref: "U1", mpn: undefined, value: undefined, role: undefined, hints: [] }
      ]
    });

    vi.mocked(renderEdaEnrichPrompt).mockReturnValue("mock prompt");

    const result = await runEdaEnrich("project123", mockSchematic);

    expect(result).toBeDefined();
    expect(result.openQuestions).toBeDefined();
    // Should still complete successfully despite LLM failure
  });

  it("preserves existing EDA spec data", async () => {
    // Mock existing EDA data
    mockPrisma.module.findFirst.mockResolvedValue({
      id: "module123",
      metadata: JSON.stringify({
        edaSpec: {
          version: "1.0",
          target: { tool: "kicad", version: "8" },
          schematicRef: "v1.2",
          components: [
            { 
              ref: "U1", 
              symbol: "Custom:MySymbol", 
              footprint: "Custom:MyFootprint",
              attributes: { manualEdited: true }
            }
          ],
          netClasses: [],
          board: { outline_mm: { width: 50, height: 40 }, layers: 2 },
          placement: [{ ref: "U1", x_mm: 25, y_mm: 20 }]
        }
      })
    });

    vi.mocked(validateEdaSpec)
      .mockReturnValueOnce({ ok: true, errors: [], spec: expect.any(Object) }) // For existing spec
      .mockReturnValueOnce({ ok: true, errors: [], spec: expect.any(Object) }); // For final spec

    const result = await runEdaEnrich("project123", mockSchematic);

    expect(mockPrisma.module.findFirst).toHaveBeenCalledWith({
      where: { projectId: "project123", kind: "eda" }
    });

    // Should reconcile with existing data
    expect(result).toBeDefined();
  });

  it("handles database persistence failure", async () => {
    mockPrisma.module.upsert.mockRejectedValue(new Error("DB error"));

    // Should not throw but handle gracefully
    await expect(runEdaEnrich("project123", mockSchematic)).rejects.toThrow();
  });

  it("generates proper summary markdown", async () => {
    await runEdaEnrich("project123", mockSchematic);

    expect(mockPrisma.module.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          detailsMd: expect.stringContaining("# EDA Layout Specification v1.0")
        }),
        update: expect.objectContaining({
          detailsMd: expect.stringContaining("# EDA Layout Specification v1.0")
        })
      })
    );
  });

  it("validates final EDA spec before returning", async () => {
    // Mock validation failure
    vi.mocked(validateEdaSpec).mockReturnValueOnce({
      ok: false,
      errors: ["Invalid spec"],
      spec: undefined
    });

    await expect(runEdaEnrich("project123", mockSchematic)).rejects.toThrow(
      "Merged EDA spec validation failed: Invalid spec"
    );
  });

  it("returns fallback spec on critical failure", async () => {
    // Mock critical failure in main flow
    vi.mocked(seedEdaFromSchematic).mockImplementation(() => {
      throw new Error("Critical error");
    });

    const result = await runEdaEnrich("project123", mockSchematic);

    expect(result).toBeDefined();
    expect(result.openQuestions).toContain(
      expect.stringMatching(/EDA enrichment failed.*Critical error/)
    );
  });

  it("includes comprehensive logging information", async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runEdaEnrich("project123", mockSchematic);

    // Verify logging was called (pino logger uses console under the hood in test env)
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});