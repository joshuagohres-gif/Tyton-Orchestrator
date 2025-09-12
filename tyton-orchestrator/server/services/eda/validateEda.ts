import { EdaSpecZ, type EdaSpecV1 } from "./spec";
import { z } from "zod";

export function validateEdaSpec(input: unknown): { ok: boolean; errors: string[]; spec?: EdaSpecV1 } {
  const res = EdaSpecZ.safeParse(input);
  if (!res.success) {
    return { ok: false, errors: res.error.errors.map(e => `${e.path.join(".")}: ${e.message}`) };
  }
  
  // Additional semantic validation
  const spec = res.data;
  const semanticErrors: string[] = [];
  
  // Validate component references consistency
  const componentRefs = new Set(spec.components.map(c => c.ref));
  const placementRefs = new Set(spec.placement.map(p => p.ref));
  
  // Check for orphaned placement entries
  for (const placementRef of placementRefs) {
    if (!componentRefs.has(placementRef)) {
      semanticErrors.push(`Placement references non-existent component: ${placementRef}`);
    }
  }
  
  // Check for components without placement
  for (const componentRef of componentRefs) {
    if (!placementRefs.has(componentRef)) {
      semanticErrors.push(`Component ${componentRef} has no placement entry`);
    }
  }
  
  // Validate board dimensions are reasonable (1mm to 1000mm)
  const { width, height } = spec.board.outline_mm;
  if (width < 1 || width > 1000) {
    semanticErrors.push(`Board width ${width}mm is outside reasonable range (1-1000mm)`);
  }
  if (height < 1 || height > 1000) {
    semanticErrors.push(`Board height ${height}mm is outside reasonable range (1-1000mm)`);
  }
  
  // Validate track widths are reasonable
  for (const netClass of spec.netClasses) {
    if (netClass.track_mm < 0.05 || netClass.track_mm > 50) {
      semanticErrors.push(`Net class ${netClass.name} track width ${netClass.track_mm}mm is outside reasonable range`);
    }
    if (netClass.clearance_mm < 0.05 || netClass.clearance_mm > 10) {
      semanticErrors.push(`Net class ${netClass.name} clearance ${netClass.clearance_mm}mm is outside reasonable range`);
    }
  }
  
  if (semanticErrors.length > 0) {
    return { ok: false, errors: semanticErrors, spec };
  }
  
  return { ok: true, errors: [], spec };
}

// Schema for validating LLM patch responses
export const ComponentPatchZ = z.object({
  ref: z.string().min(1).max(20).regex(/^[A-Z][A-Z0-9]*[0-9]+$/, "Component ref must follow format like R1, C12, U3"),
  symbol: z.string().min(1).max(100).refine(
    (s) => s === "TBD" || s.includes(":"), 
    "Symbol must be 'TBD' or include library prefix (e.g. 'Device:R_Small')"
  ),
  footprint: z.string().min(1).max(100).refine(
    (s) => s === "TBD" || s.includes(":"),
    "Footprint must be 'TBD' or include library prefix (e.g. 'Resistor_SMD:R_0603_1608Metric')"
  ),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(500).optional()
});

export const LLMPatchResponseZ = z.object({
  patches: z.array(ComponentPatchZ).max(1000) // Safety limit
});

export type ComponentPatch = z.infer<typeof ComponentPatchZ>;
export type LLMPatchResponse = z.infer<typeof LLMPatchResponseZ>;

export function validateLLMPatches(input: unknown): { ok: boolean; errors: string[]; patches?: ComponentPatch[] } {
  const res = LLMPatchResponseZ.safeParse(input);
  if (!res.success) {
    return { 
      ok: false, 
      errors: res.error.errors.map(e => `${e.path.join(".")}: ${e.message}`) 
    };
  }
  
  // Additional validation for patch safety
  const patches = res.data.patches;
  const refs = patches.map(p => p.ref);
  const duplicateRefs = refs.filter((ref, index) => refs.indexOf(ref) !== index);
  
  if (duplicateRefs.length > 0) {
    return { 
      ok: false, 
      errors: [`Duplicate component references in patches: ${duplicateRefs.join(', ')}`],
      patches: patches
    };
  }
  
  // Check for suspicious patterns that might indicate injection attempts
  const suspiciousPatterns = [
    /javascript:/i,
    /<script/i,
    /eval\(/i,
    /function\s*\(/i,
    /document\./i,
    /window\./i
  ];
  
  for (const patch of patches) {
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(patch.symbol) || pattern.test(patch.footprint) || (patch.notes && pattern.test(patch.notes))) {
        return { 
          ok: false, 
          errors: [`Suspicious content detected in patch for ${patch.ref}`],
          patches: patches
        };
      }
    }
  }
  
  return { ok: true, errors: [], patches };
}

// Utility function to sanitize user input strings
export function sanitizeString(input: string, maxLength = 100): string {
  return input
    .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
    .trim()
    .substring(0, maxLength);
}

// Validate that component attributes are safe
export function validateComponentAttributes(attributes: any): { ok: boolean; errors: string[] } {
  if (!attributes || typeof attributes !== 'object') {
    return { ok: true, errors: [] };
  }
  
  const errors: string[] = [];
  
  // Check for oversized attribute objects
  const attributeStr = JSON.stringify(attributes);
  if (attributeStr.length > 10000) {
    errors.push('Component attributes exceed maximum size limit');
  }
  
  // Validate specific attribute types
  if (attributes.pins && (typeof attributes.pins !== 'number' || attributes.pins < 1 || attributes.pins > 1000)) {
    errors.push('Component pins attribute must be a number between 1 and 1000');
  }
  
  if (attributes.pitch_mm && (typeof attributes.pitch_mm !== 'number' || attributes.pitch_mm <= 0 || attributes.pitch_mm > 100)) {
    errors.push('Component pitch_mm must be a positive number ≤ 100');
  }
  
  if (attributes.mapping_confidence && (typeof attributes.mapping_confidence !== 'number' || attributes.mapping_confidence < 0 || attributes.mapping_confidence > 1)) {
    errors.push('Component mapping_confidence must be a number between 0 and 1');
  }
  
  return { ok: errors.length === 0, errors };
}