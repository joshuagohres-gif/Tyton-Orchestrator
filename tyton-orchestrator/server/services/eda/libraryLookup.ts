// /server/services/eda/libraryLookup.ts
import type { EdaSpecV1 } from "./spec";
import { ALL_RULES, LibraryRule } from "./libraryMaps";
import { getLibraryByMpns, ComponentLibraryEntry } from "./libraryService";
import pino from "pino";

const logger = pino().child({ service: 'libraryLookup' });

export type LookupInput = {
  ref: string;
  value?: string;
  mpn?: string;
  role?: string;
  pins?: number;
  pitchMm?: number;
  refPrefix?: string; // e.g., R C U J D Y L Q
};

export type LookupResult = {
  symbol: string | "TBD";
  footprint: string | "TBD";
  confidence: number;
  ruleId?: string;
  notes?: string;
  source?: 'db' | 'heuristic' | 'none';
};

export type ApplySuggestionsResult = {
  eda: EdaSpecV1;
  changes: number;
  tbd: number;
  lowConfidence: number;
  dbHits: number;
  heuristicHits: number;
  unresolved: Array<{
    ref: string;
    mpn?: string;
    value?: string;
    role?: string;
    hints: string[];
  }>;
};

function matchRule(r: LibraryRule, i: LookupInput): boolean {
  const m = r.matches;
  if (m.mpnRegex && !(i.mpn && m.mpnRegex.test(i.mpn))) return false;
  if (m.valueRegex && !(i.value && m.valueRegex.test(i.value))) return false;
  if (m.refPrefix && !(i.refPrefix && m.refPrefix.test(i.refPrefix))) return false;
  if (m.roleIncludes && !m.roleIncludes.some(tok => (i.role||"").toLowerCase().includes(tok.toLowerCase()))) return false;
  if (typeof m.pinsGte === "number" && !((i.pins || 0) >= m.pinsGte)) return false;
  if (typeof m.pitchMm === "number" && !(Math.abs((i.pitchMm || 0) - m.pitchMm) < 0.11)) return false;
  return true;
}

export function suggestLibraries(i: LookupInput): LookupResult {
  // Try rules in order; pick max confidence among matches.
  const matches = ALL_RULES.filter(r => matchRule(r, i));
  if (!matches.length) {
    return { symbol: "TBD", footprint: "TBD", confidence: 0, notes: "No mapping rule matched." };
  }
  // Prefer higher confidence
  const best = matches.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
  const fp = typeof best.footprint === "function" ? best.footprint({ pins: i.pins, pitchMm: i.pitchMm }) : best.footprint;
  let symbol = best.symbol;

  // Resolve generic connector symbol to specific pin count, if needed
  if (symbol === "Connector_Generic:Conn_01x??" && i.pins) {
    symbol = `Connector_Generic:Conn_01x${i.pins}`;
  }

  return {
    symbol: (symbol === "TBD" ? "TBD" : symbol),
    footprint: (fp === "TBD" ? "TBD" : fp),
    confidence: best.confidence,
    ruleId: best.id,
    notes: best.notes
  };
}

// Apply suggestions to an EDA spec with DB-first approach
export async function applySuggestions(
  eda: EdaSpecV1, 
  opts?: { 
    preserveExisting?: boolean; 
    minHeuristicConfidence?: number;
  }
): Promise<ApplySuggestionsResult> {
  const preserve = opts?.preserveExisting ?? true;
  const minConf = opts?.minHeuristicConfidence ?? 0.75;
  
  let changes = 0;
  let tbd = 0;
  let lowConfidence = 0;
  let dbHits = 0;
  let heuristicHits = 0;
  const unresolved: ApplySuggestionsResult['unresolved'] = [];

  // Step 1: Batch lookup all MPNs from DB
  const mpns = eda.components.map(c => c.mpn || "").filter(Boolean);
  const libMap = await getLibraryByMpns(mpns);
  
  logger.info({ 
    totalComponents: eda.components.length,
    uniqueMpns: mpns.length,
    dbHits: libMap.size 
  }, 'Starting library lookup');

  // Step 2: Process each component
  const updatedComponents = eda.components.map(c => {
    const manual = c.attributes?.manualEdited === true;
    const keepExisting = preserve && (manual || (c.symbol && c.footprint && c.symbol !== "TBD" && c.footprint !== "TBD"));
    
    if (keepExisting) return c;

    const candidate = { ...c };
    let confidence = 0;
    let source: 'db' | 'heuristic' | 'none' = 'none';
    let ruleId: string | undefined;
    let notes: string | undefined;

    // Step 2a: Try DB exact MPN match first
    const dbEntry = c.mpn ? libMap.get(c.mpn) : undefined;
    if (dbEntry && (dbEntry.symbol || dbEntry.footprint)) {
      if (dbEntry.symbol && !candidate.symbol) candidate.symbol = dbEntry.symbol;
      if (dbEntry.footprint && !candidate.footprint) candidate.footprint = dbEntry.footprint;
      confidence = 1.0; // DB entries are highest confidence
      source = 'db';
      notes = 'Exact MPN match from database';
      dbHits++;
      
      logger.debug({ ref: c.ref, mpn: c.mpn, symbol: dbEntry.symbol, footprint: dbEntry.footprint }, 'DB hit');
    }

    // Step 2b: Try heuristic rules if still missing symbol/footprint
    if (!candidate.symbol || !candidate.footprint || candidate.symbol === "TBD" || candidate.footprint === "TBD") {
      const refPrefix = c.ref.replace(/[0-9].*$/, ""); // "R23" -> "R"
      const pinsGuess = (c.attributes?.pins as number|undefined) || undefined;
      const pitchGuess = (c.attributes?.pitch_mm as number|undefined) || undefined;
      const roleText = (c.role || "").toString();
      
      const heuristicResult = suggestLibraries({
        ref: c.ref,
        value: c.value,
        mpn: c.mpn,
        role: roleText,
        pins: pinsGuess,
        pitchMm: pitchGuess,
        refPrefix
      });

      if (heuristicResult && heuristicResult.confidence >= minConf) {
        if (!candidate.symbol || candidate.symbol === "TBD") {
          candidate.symbol = heuristicResult.symbol;
        }
        if (!candidate.footprint || candidate.footprint === "TBD") {
          candidate.footprint = heuristicResult.footprint;
        }
        confidence = Math.max(confidence, heuristicResult.confidence);
        source = source === 'db' ? 'db' : 'heuristic';
        ruleId = heuristicResult.ruleId;
        notes = heuristicResult.notes;
        heuristicHits++;
        
        if (heuristicResult.confidence < 0.9) {
          lowConfidence++;
        }
        
        logger.debug({ 
          ref: c.ref, 
          confidence: heuristicResult.confidence, 
          ruleId: heuristicResult.ruleId 
        }, 'Heuristic hit');
      }
    }

    // Step 2c: Handle unresolved components
    if (!candidate.symbol || !candidate.footprint || candidate.symbol === "TBD" || candidate.footprint === "TBD") {
      candidate.symbol = candidate.symbol || "TBD";
      candidate.footprint = candidate.footprint || "TBD";
      
      // Collect hints for LLM
      const hints: string[] = [];
      if (c.mpn) hints.push(`MPN: ${c.mpn}`);
      if (c.value) hints.push(`Value: ${c.value}`);
      if (c.role) hints.push(`Role: ${c.role}`);
      if (c.attributes?.pins) hints.push(`Pins: ${c.attributes.pins}`);
      if (c.attributes?.pitch_mm) hints.push(`Pitch: ${c.attributes.pitch_mm}mm`);
      
      unresolved.push({
        ref: c.ref,
        mpn: c.mpn,
        value: c.value,
        role: c.role,
        hints
      });
      
      tbd++;
    }

    // Step 2d: Update component attributes with metadata
    if (confidence > 0 || source !== 'none') {
      candidate.attributes = { 
        ...(candidate.attributes || {}), 
        mapping_confidence: confidence,
        mapping_source: source,
        ...(ruleId && { mapping_rule: ruleId })
      };
    }

    // Step 2e: Add notes for TBDs
    if (candidate.symbol === "TBD" || candidate.footprint === "TBD") {
      const mappingNotes = Array.isArray(candidate.attributes?.mapping_notes) ? 
        candidate.attributes!.mapping_notes : [];
      
      const noteText = notes || "Add exact MPN or choose symbol/footprint manually";
      candidate.attributes = { 
        ...(candidate.attributes || {}), 
        mapping_notes: [...mappingNotes, noteText]
      };
    }

    if (candidate.symbol !== c.symbol || candidate.footprint !== c.footprint) {
      changes++;
    }

    return candidate;
  });

  const result: ApplySuggestionsResult = {
    eda: { ...eda, components: updatedComponents },
    changes,
    tbd,
    lowConfidence,
    dbHits,
    heuristicHits,
    unresolved
  };
  
  logger.info({
    changes,
    tbd,
    lowConfidence,
    dbHits,
    heuristicHits,
    unresolvedCount: unresolved.length
  }, 'Library lookup completed');

  return result;
}