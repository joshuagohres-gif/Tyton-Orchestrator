import { validateSchematicSpec } from "@/server/validation/schematicSpecValidator";

export interface IngestResult {
  spec?: any;                    // SchematicSpec v1.2
  warnings: string[];
  errors: string[];
  source: "json" | "table_merge" | "failed";
  rawJson?: string;
}

/**
 * Extract and parse schematic spec from mixed text content
 * Handles code-fenced JSON, loose JSON, and pin table merging
 */
export function ingestSchematicFromText(text: string): IngestResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Step 1: Extract JSON blocks from text
  const jsonBlocks = extractJsonBlocks(text);
  
  if (jsonBlocks.length === 0) {
    return {
      warnings,
      errors: ["No JSON blocks found in text"],
      source: "failed"
    };
  }

  // Step 2: Parse and validate JSON blocks
  const validSpecs: Array<{ spec: any; json: string; score: number }> = [];
  
  for (const jsonText of jsonBlocks) {
    const parseResult = parseJsonLenient(jsonText);
    
    if (parseResult.success && parseResult.data) {
      const score = scoreSchematicCandidate(parseResult.data);
      if (score > 0) {
        validSpecs.push({
          spec: parseResult.data,
          json: jsonText,
          score
        });
      }
    } else if (parseResult.error) {
      warnings.push(`JSON parse warning: ${parseResult.error}`);
    }
  }

  if (validSpecs.length === 0) {
    return {
      warnings,
      errors: ["No valid schematic JSON found"],
      source: "failed"
    };
  }

  // Step 3: Choose best candidate (highest score, prefer v1.2, latest if tied)
  validSpecs.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score; // Higher score first
    // Prefer v1.2
    const aVersion = a.spec.version === "1.2" ? 1 : 0;
    const bVersion = b.spec.version === "1.2" ? 1 : 0;
    return bVersion - aVersion;
  });

  let bestSpec = validSpecs[0].spec;
  const rawJson = validSpecs[0].json;

  // Step 4: Attempt pin table merge if needed
  if (hasIncompleteNets(bestSpec)) {
    const pinTable = extractPinTable(text);
    if (pinTable.length > 0) {
      warnings.push("Found incomplete nets in JSON, attempting pin table merge");
      bestSpec = mergePinTable(bestSpec, pinTable);
      warnings.push(`Merged ${pinTable.length} pins from pin table`);
    } else {
      warnings.push("Incomplete nets found but no pin table available for merge");
    }
  }

  // Step 5: Final validation
  const validation = validateSchematicSpec(bestSpec);
  if (!validation.ok) {
    return {
      spec: bestSpec,
      warnings,
      errors: validation.errors || ["Validation failed"],
      source: "json",
      rawJson
    };
  }

  return {
    spec: bestSpec,
    warnings,
    errors,
    source: "json",
    rawJson
  };
}

/**
 * Extract JSON blocks from text (code-fenced or standalone)
 */
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];

  // Pattern 1: Code-fenced JSON
  const codeFencedRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/gi;
  let match;
  while ((match = codeFencedRegex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }

  // Pattern 2: Inline code blocks with json
  const inlineRegex = /`([^`]*(?:version|components|nets)[^`]*)`/gi;
  while ((match = inlineRegex.exec(text)) !== null) {
    if (match[1].includes('{') && match[1].includes('}')) {
      blocks.push(match[1].trim());
    }
  }

  // Pattern 3: Raw JSON objects (heuristic)
  const jsonObjectRegex = /\{[^{}]*(?:version|components|nets)[^{}]*\}(?:\s*,\s*\{[^{}]*\})*/gi;
  while ((match = jsonObjectRegex.exec(text)) !== null) {
    blocks.push(match[0].trim());
  }

  // Remove duplicates
  return [...new Set(blocks)];
}

/**
 * Parse JSON with lenient error recovery
 */
function parseJsonLenient(jsonText: string): { success: boolean; data?: any; error?: string } {
  try {
    // Try direct parse first
    return { success: true, data: JSON.parse(jsonText) };
  } catch (e) {
    // Attempt fixes for common issues
    let cleaned = jsonText;
    
    // Fix trailing commas
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix smart quotes
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");
    
    // Fix missing quotes on keys
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Fix single quotes to double quotes
    cleaned = cleaned.replace(/'/g, '"');
    
    try {
      return { success: true, data: JSON.parse(cleaned) };
    } catch (e2) {
      return { 
        success: false, 
        error: `Parse failed: ${(e as Error).message}` 
      };
    }
  }
}

/**
 * Score a JSON object as a schematic spec candidate
 */
function scoreSchematicCandidate(obj: any): number {
  let score = 0;

  // Must be an object
  if (typeof obj !== 'object' || obj === null) return 0;

  // Check for schematic-specific fields
  if (obj.version) score += 20;
  if (obj.version === "1.2") score += 10;
  if (obj.components && Array.isArray(obj.components)) score += 30;
  if (obj.nets && Array.isArray(obj.nets)) score += 20;
  if (obj.constraints) score += 10;
  if (obj.metadata) score += 5;

  // Penalty for non-schematic fields
  if (obj.eda || obj.placement || obj.board) score -= 10;

  return Math.max(0, score);
}

/**
 * Check if spec has incomplete net assignments
 */
function hasIncompleteNets(spec: any): boolean {
  if (!spec.components || !Array.isArray(spec.components)) return false;

  return spec.components.some((comp: any) => {
    if (!comp.pins || !Array.isArray(comp.pins)) return false;
    return comp.pins.some((pin: any) => !pin.net || pin.net === "");
  });
}

/**
 * Extract pin table from text
 */
function extractPinTable(text: string): Array<{ ref: string; pin: string; net: string }> {
  const pins: Array<{ ref: string; pin: string; net: string }> = [];
  
  // Look for table-like structures
  const lines = text.split('\n');
  const tableRegex = /^\s*\|?\s*([A-Z]+\d+)\s*\|?\s*(\d+|[A-Z_]+)\s*\|?\s*([A-Z_][A-Z0-9_]*)\s*\|?\s*$/i;
  
  for (const line of lines) {
    const match = line.match(tableRegex);
    if (match) {
      pins.push({
        ref: match[1].toUpperCase(),
        pin: match[2],
        net: match[3].toUpperCase()
      });
    }
  }

  // Alternative: CSV-like format
  const csvRegex = /([A-Z]+\d+),\s*(\d+|[A-Z_]+),\s*([A-Z_][A-Z0-9_]*)/gi;
  let csvMatch;
  while ((csvMatch = csvRegex.exec(text)) !== null) {
    pins.push({
      ref: csvMatch[1].toUpperCase(),
      pin: csvMatch[2],
      net: csvMatch[3].toUpperCase()
    });
  }

  return pins;
}

/**
 * Merge pin table data into schematic spec
 */
function mergePinTable(
  spec: any, 
  pinTable: Array<{ ref: string; pin: string; net: string }>
): any {
  const updated = JSON.parse(JSON.stringify(spec)); // Deep clone

  if (!updated.components || !Array.isArray(updated.components)) {
    return updated;
  }

  // Create lookup map
  const pinMap = new Map<string, Map<string, string>>();
  for (const entry of pinTable) {
    if (!pinMap.has(entry.ref)) {
      pinMap.set(entry.ref, new Map());
    }
    pinMap.get(entry.ref)!.set(entry.pin, entry.net);
  }

  // Apply to components
  for (const component of updated.components) {
    if (!component.ref || !component.pins) continue;
    
    const compPins = pinMap.get(component.ref);
    if (!compPins) continue;

    for (const pin of component.pins) {
      const pinKey = pin.number || pin.name || pin.pin;
      if (pinKey && compPins.has(pinKey.toString())) {
        const netName = compPins.get(pinKey.toString())!;
        if (!pin.net || pin.net === "") {
          pin.net = netName;
        }
      }
    }
  }

  // Ensure nets array includes all referenced nets
  const allNets = new Set<string>();
  for (const component of updated.components) {
    if (component.pins) {
      for (const pin of component.pins) {
        if (pin.net) allNets.add(pin.net);
      }
    }
  }

  if (!updated.nets) updated.nets = [];
  const existingNets = new Set(updated.nets.map((n: any) => n.name));
  
  for (const netName of allNets) {
    if (!existingNets.has(netName)) {
      updated.nets.push({ name: netName });
    }
  }

  return updated;
}

/**
 * Extract code quality statistics from ingestion
 */
export function getIngestStats(result: IngestResult): {
  confidence: number;
  completeness: number;
  issues: number;
} {
  let confidence = 0;
  let completeness = 0;
  const issues = result.errors.length + result.warnings.length;

  if (result.spec) {
    // Confidence based on source and validation
    if (result.source === "json") confidence = 0.9;
    else if (result.source === "table_merge") confidence = 0.7;
    
    if (result.errors.length === 0) confidence += 0.1;
    else confidence = Math.max(0, confidence - 0.2);

    // Completeness based on field presence
    const spec = result.spec;
    if (spec.components && spec.components.length > 0) completeness += 0.4;
    if (spec.nets && spec.nets.length > 0) completeness += 0.3;
    if (spec.constraints) completeness += 0.1;
    if (spec.metadata) completeness += 0.1;
    
    // Check pin completeness
    if (spec.components) {
      const totalPins = spec.components.reduce((sum: number, comp: any) => 
        sum + (comp.pins?.length || 0), 0);
      const connectedPins = spec.components.reduce((sum: number, comp: any) => 
        sum + (comp.pins?.filter((p: any) => p.net).length || 0), 0);
      
      if (totalPins > 0) {
        completeness += 0.1 * (connectedPins / totalPins);
      }
    }
  }

  return {
    confidence: Math.min(1, confidence),
    completeness: Math.min(1, completeness),
    issues
  };
}