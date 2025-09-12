// Enhanced version that builds on existing lookup system
import { suggestLibraries as baseSuggestLibraries, applySuggestions as baseApplySuggestions } from "@/server/services/eda/libraryLookup";
import { ALL_EXTENDED_RULES, getQuickPickFootprints, validateLibraryExists, getAlternativeFootprints } from "./maps";
import { ALL_RULES } from "@/server/services/eda/libraryMaps";
import type { EdaSpecV1 } from "../specs/edaSpecV10";

export interface EnhancedLookupInput {
  ref: string;
  value?: string;
  mpn?: string;
  role?: string;
  pins?: number;
  pitchMm?: number;
  refPrefix?: string;
  voltage?: number;      // Operating voltage
  current?: number;      // Current rating
  power?: number;        // Power rating
  tolerance?: string;    // Tolerance for passives
  package?: string;      // Package preference
}

export interface EnhancedLookupResult {
  symbol: string;
  footprint: string;
  confidence: number;
  ruleId?: string;
  notes?: string;
  alternatives: string[];           // Alternative footprints
  quickPicks: string[];            // Quick-pick suggestions
  libraryExists: boolean;          // Whether library is available
  suggestions?: {
    symbol?: string[];
    footprint?: string[];
  };
}

/**
 * Enhanced library lookup with extended rules and alternatives
 */
export function enhancedSuggestLibraries(input: EnhancedLookupInput): EnhancedLookupResult {
  // First try the base system
  const baseResult = baseSuggestLibraries({
    ref: input.ref,
    value: input.value,
    mpn: input.mpn,
    role: input.role,
    pins: input.pins,
    pitchMm: input.pitchMm,
    refPrefix: input.refPrefix
  });

  // If base system found a good match, enhance it
  if (baseResult.confidence > 0.7) {
    const alternatives = getAlternativeFootprints(baseResult.footprint);
    const quickPicks = getQuickPickFootprints(input.role || "");
    const libraryExists = validateLibraryExists(baseResult.symbol);

    return {
      symbol: baseResult.symbol,
      footprint: baseResult.footprint,
      confidence: baseResult.confidence,
      ruleId: baseResult.ruleId,
      notes: baseResult.notes,
      alternatives,
      quickPicks,
      libraryExists
    };
  }

  // Try extended rules for better coverage
  const allRules = [...ALL_RULES, ...ALL_EXTENDED_RULES];
  const matches = allRules.filter(rule => matchesRule(rule, input));

  if (matches.length === 0) {
    return createTBDResult(input);
  }

  // Find best match considering enhanced criteria
  const bestMatch = matches.reduce((best, current) => {
    let score = current.confidence;
    
    // Boost score for voltage/power matching
    if (input.voltage && hasVoltageMatch(current, input.voltage)) score += 0.1;
    if (input.power && hasPowerMatch(current, input.power)) score += 0.1;
    if (input.package && hasPackageMatch(current, input.package)) score += 0.15;
    
    return score > best.score ? { rule: current, score } : best;
  }, { rule: matches[0], score: matches[0].confidence });

  const rule = bestMatch.rule;
  const footprint = typeof rule.footprint === "function" 
    ? rule.footprint({ pins: input.pins, pitchMm: input.pitchMm })
    : rule.footprint;

  let symbol = rule.symbol;
  if (symbol === "Connector_Generic:Conn_01x??" && input.pins) {
    symbol = `Connector_Generic:Conn_01x${input.pins}`;
  }

  const alternatives = getAlternativeFootprints(footprint);
  const quickPicks = getQuickPickFootprints(input.role || "");
  const libraryExists = validateLibraryExists(symbol);

  return {
    symbol,
    footprint,
    confidence: bestMatch.score,
    ruleId: rule.id,
    notes: rule.notes,
    alternatives,
    quickPicks,
    libraryExists
  };
}

/**
 * Apply enhanced suggestions to EDA spec
 */
export function enhancedApplySuggestions(
  eda: EdaSpecV1, 
  opts?: { 
    preserveExisting?: boolean;
    includeAlternatives?: boolean;
    validateLibraries?: boolean;
  }
): { 
  eda: EdaSpecV1; 
  changes: number; 
  tbd: number;
  warnings: string[];
} {
  const preserve = opts?.preserveExisting ?? true;
  const includeAlts = opts?.includeAlternatives ?? false;
  const validateLibs = opts?.validateLibraries ?? true;
  
  let changes = 0;
  let tbd = 0;
  const warnings: string[] = [];

  const updatedComponents = eda.components.map(component => {
    const refPrefix = component.ref.replace(/[0-9].*$/, "");
    
    const input: EnhancedLookupInput = {
      ref: component.ref,
      value: component.value,
      mpn: component.mpn,
      role: component.role,
      pins: component.attributes?.pins as number,
      pitchMm: component.attributes?.pitch_mm as number,
      refPrefix,
      voltage: component.attributes?.voltage as number,
      current: component.attributes?.current as number,
      power: component.attributes?.power as number,
      tolerance: component.attributes?.tolerance as string,
      package: component.attributes?.package as string,
    };

    const suggestion = enhancedSuggestLibraries(input);
    const updated = { ...component };

    // Apply suggestions
    if (!(preserve && component.symbol)) {
      updated.symbol = suggestion.symbol;
    }
    if (!(preserve && component.footprint)) {
      updated.footprint = suggestion.footprint;
    }

    // Track changes and TBDs
    if (updated.symbol !== component.symbol || updated.footprint !== component.footprint) {
      changes++;
    }
    if (updated.symbol === "TBD" || updated.footprint === "TBD") {
      tbd++;
    }

    // Validate library availability
    if (validateLibs && !suggestion.libraryExists && suggestion.symbol !== "TBD") {
      warnings.push(`Library may not be available: ${suggestion.symbol} for ${component.ref}`);
    }

    // Add enhanced attributes
    if (!updated.attributes) updated.attributes = {};
    
    updated.attributes.mapping_confidence = suggestion.confidence;
    updated.attributes.mapping_rule = suggestion.ruleId;
    
    if (suggestion.alternatives.length > 0) {
      updated.attributes.alternative_footprints = suggestion.alternatives;
    }
    
    if (suggestion.quickPicks.length > 0) {
      updated.attributes.quick_picks = suggestion.quickPicks;
    }

    // Add detailed notes for TBD components
    if (updated.symbol === "TBD" || updated.footprint === "TBD") {
      const notes: string[] = [];
      
      if (suggestion.quickPicks.length > 0) {
        notes.push(`Quick-pick options: ${suggestion.quickPicks.slice(0, 3).join(", ")}`);
      }
      
      if (input.role) {
        notes.push(`Component role: ${input.role}`);
      }
      
      if (input.package) {
        notes.push(`Preferred package: ${input.package}`);
      }

      updated.attributes.mapping_notes = [
        ...(Array.isArray(updated.attributes.mapping_notes) ? updated.attributes.mapping_notes : []),
        ...notes
      ];
    }

    return updated;
  });

  return {
    eda: { ...eda, components: updatedComponents },
    changes,
    tbd,
    warnings
  };
}

/**
 * Create TBD result with helpful suggestions
 */
function createTBDResult(input: EnhancedLookupInput): EnhancedLookupResult {
  const quickPicks = getQuickPickFootprints(input.role || "");
  
  const notes = [
    `No mapping rule found for ${input.ref}`,
    input.role && `Role: ${input.role}`,
    input.value && `Value: ${input.value}`,
    input.mpn && `MPN: ${input.mpn}`,
    quickPicks.length > 0 && `Consider: ${quickPicks.slice(0, 2).join(", ")}`
  ].filter(Boolean).join("; ");

  return {
    symbol: "TBD",
    footprint: "TBD", 
    confidence: 0,
    notes,
    alternatives: [],
    quickPicks,
    libraryExists: false,
    suggestions: {
      footprint: quickPicks.slice(0, 5)
    }
  };
}

// Helper functions for enhanced matching
function matchesRule(rule: any, input: EnhancedLookupInput): boolean {
  const m = rule.matches;
  if (m.mpnRegex && !(input.mpn && m.mpnRegex.test(input.mpn))) return false;
  if (m.valueRegex && !(input.value && m.valueRegex.test(input.value))) return false;
  if (m.refPrefix && !(input.refPrefix && m.refPrefix.test(input.refPrefix))) return false;
  if (m.roleIncludes && !m.roleIncludes.some((tok: string) => (input.role || "").toLowerCase().includes(tok.toLowerCase()))) return false;
  if (typeof m.pinsGte === "number" && !((input.pins || 0) >= m.pinsGte)) return false;
  if (typeof m.pitchMm === "number" && !(Math.abs((input.pitchMm || 0) - m.pitchMm) < 0.11)) return false;
  return true;
}

function hasVoltageMatch(rule: any, voltage: number): boolean {
  // Check if rule notes mention compatible voltage
  const notes = (rule.notes || "").toLowerCase();
  if (voltage <= 3.6 && notes.includes("3.3v")) return true;
  if (voltage <= 5.5 && notes.includes("5v")) return true;
  if (voltage <= 12.5 && notes.includes("12v")) return true;
  return false;
}

function hasPowerMatch(rule: any, power: number): boolean {
  const notes = (rule.notes || "").toLowerCase();
  if (power <= 0.25 && (rule.footprint?.includes("0603") || notes.includes("low power"))) return true;
  if (power <= 0.5 && (rule.footprint?.includes("0805") || notes.includes("0.5w"))) return true;
  if (power >= 1.0 && (rule.footprint?.includes("1206") || notes.includes("1w"))) return true;
  return false;
}

function hasPackageMatch(rule: any, preferredPackage: string): boolean {
  const footprint = (rule.footprint || "").toLowerCase();
  const pkg = preferredPackage.toLowerCase();
  
  if (pkg.includes("smd") && (footprint.includes("0603") || footprint.includes("0805"))) return true;
  if (pkg.includes("tht") && footprint.includes("tht")) return true;
  if (pkg.includes("qfn") && footprint.includes("qfn")) return true;
  if (pkg.includes("soic") && footprint.includes("soic")) return true;
  
  return false;
}

/**
 * Get component suggestions based on role and constraints
 */
export function getSuggestedComponents(
  role: string,
  constraints?: {
    voltage?: number;
    current?: number;
    frequency?: number;
    accuracy?: number;
  }
): Array<{
  name: string;
  mpn: string;
  description: string;
  symbol: string;
  footprint: string;
}> {
  const suggestions: any[] = [];
  
  switch (role.toLowerCase()) {
    case "mcu":
      suggestions.push(
        { name: "ESP32-WROOM-32", mpn: "ESP32-WROOM-32", description: "WiFi + Bluetooth MCU", symbol: "RF_Module:ESP32-WROOM-32", footprint: "RF_Module:ESP32-WROOM-32" },
        { name: "STM32F103C8T6", mpn: "STM32F103C8T6", description: "ARM Cortex-M3 MCU", symbol: "MCU_ST_STM32F1:STM32F103C8Tx", footprint: "Package_QFP:LQFP-48_7x7mm_P0.5mm" }
      );
      break;
      
    case "regulator":
      if (constraints?.voltage && constraints.voltage <= 3.3) {
        suggestions.push({ name: "AP2112K-3.3", mpn: "AP2112K-3.3TRG1", description: "3.3V LDO Regulator", symbol: "Regulator_Linear:AP2112K-3.3", footprint: "Package_TO_SOT_SMD:SOT-23-5" });
      }
      if (constraints?.current && constraints.current >= 1.0) {
        suggestions.push({ name: "AMS1117-3.3", mpn: "AMS1117-3.3", description: "3.3V 1A LDO", symbol: "Regulator_Linear:AMS1117-3.3", footprint: "Package_TO_SOT_SMD:SOT-223-3_TabPin2" });
      }
      break;
      
    case "sensor":
      suggestions.push(
        { name: "BME280", mpn: "BME280", description: "Humidity/Pressure/Temperature", symbol: "Sensor_Environmental:BME280", footprint: "Package_LGA:Bosch_LGA-8_2.5x2.5mm_P0.65mm" },
        { name: "MPU-6050", mpn: "MPU-6050", description: "6-axis IMU", symbol: "Sensor_Motion:MPU-6050", footprint: "Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.7x2.7mm" }
      );
      break;
  }
  
  return suggestions;
}