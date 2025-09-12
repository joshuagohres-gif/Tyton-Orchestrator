import type { EdaSpecV1 } from "../specs/edaSpecV10";

export interface DrcRule {
  id: string;
  name: string;
  description: string;
  category: "spacing" | "width" | "via" | "drill" | "copper" | "mask" | "assembly";
  severity: "error" | "warning" | "info";
  value?: number;
  unit?: "mm" | "mil";
  enabled: boolean;
}

export interface DrcViolation {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  location: { x: number; y: number };
  layer?: string;
  objects: string[];
  measured?: number;
  expected?: number;
  unit?: string;
  suggestion?: string;
}

export interface DrcResult {
  passed: boolean;
  violations: DrcViolation[];
  stats: {
    errors: number;
    warnings: number;
    info: number;
    rulesChecked: number;
    objectsChecked: number;
    layersChecked: number;
  };
  executionTime: number;
}

// Standard DRC rules (typical PCB manufacturing constraints)
export const DEFAULT_DRC_RULES: DrcRule[] = [
  {
    id: "drc_001",
    name: "Minimum Track Width",
    description: "Track width must meet minimum requirements",
    category: "width",
    severity: "error",
    value: 0.1, // mm
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_002",
    name: "Minimum Track Spacing",
    description: "Spacing between tracks must meet minimum clearance",
    category: "spacing",
    severity: "error", 
    value: 0.1, // mm
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_003",
    name: "Minimum Via Size",
    description: "Via diameter must meet minimum drill size",
    category: "via",
    severity: "error",
    value: 0.15, // mm
    unit: "mm", 
    enabled: true
  },
  {
    id: "drc_004",
    name: "Via to Via Spacing",
    description: "Minimum spacing between via centers",
    category: "spacing",
    severity: "error",
    value: 0.3, // mm
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_005",
    name: "Minimum Drill Size", 
    description: "Drill holes must meet minimum manufacturable size",
    category: "drill",
    severity: "error",
    value: 0.1, // mm
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_006",
    name: "Copper to Board Edge",
    description: "Minimum distance from copper to board edge",
    category: "spacing",
    severity: "warning",
    value: 0.2, // mm
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_007",
    name: "Solder Mask Expansion",
    description: "Solder mask opening larger than copper pad",
    category: "mask",
    severity: "warning",
    value: 0.05, // mm expansion
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_008",
    name: "Silkscreen to Copper Spacing",
    description: "Silkscreen must not overlap exposed copper",
    category: "spacing",
    severity: "warning",
    value: 0.15, // mm
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_009",
    name: "Component Courtyard Overlap",
    description: "Component courtyards must not overlap",
    category: "assembly",
    severity: "error",
    value: 0.0,
    unit: "mm",
    enabled: true
  },
  {
    id: "drc_010",
    name: "Minimum Annular Ring",
    description: "Minimum copper ring around drilled holes",
    category: "copper",
    severity: "warning",
    value: 0.05, // mm
    unit: "mm",
    enabled: true
  }
];

/**
 * Run Design Rules Check on EDA specification
 */
export function runDrc(
  eda: EdaSpecV1,
  rules: DrcRule[] = DEFAULT_DRC_RULES,
  options: { stopOnError?: boolean; fabricationClass?: string } = {}
): DrcResult {
  const startTime = Date.now();
  const violations: DrcViolation[] = [];
  const enabledRules = rules.filter(rule => rule.enabled);

  // Adjust rules based on fabrication class
  const adjustedRules = adjustRulesForFabClass(enabledRules, options.fabricationClass);

  // Extract geometric data from placement and constraints
  const geometricData = extractGeometricData(eda);

  // Run each enabled rule
  for (const rule of adjustedRules) {
    const ruleViolations = checkDrcRule(rule, eda, geometricData);
    violations.push(...ruleViolations);

    if (options.stopOnError && ruleViolations.some(v => v.severity === "error")) {
      break;
    }
  }

  const stats = {
    errors: violations.filter(v => v.severity === "error").length,
    warnings: violations.filter(v => v.severity === "warning").length,
    info: violations.filter(v => v.severity === "info").length,
    rulesChecked: adjustedRules.length,
    objectsChecked: geometricData.objects.length,
    layersChecked: geometricData.layers.length
  };

  return {
    passed: stats.errors === 0,
    violations,
    stats,
    executionTime: Date.now() - startTime
  };
}

/**
 * Extract geometric data for DRC analysis
 */
function extractGeometricData(eda: EdaSpecV1) {
  const objects: any[] = [];
  const layers = new Set<string>();
  
  // Extract component footprints and positions
  for (const component of eda.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    if (placement) {
      objects.push({
        type: "component",
        ref: component.ref,
        footprint: component.footprint,
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation || 0,
        side: placement.side || "front",
        bounds: estimateComponentBounds(component.footprint, placement)
      });
      
      layers.add(placement.side === "back" ? "B.Cu" : "F.Cu");
    }
  }

  // Add board outline
  if (eda.board) {
    objects.push({
      type: "board_edge",
      width: eda.board.width,
      height: eda.board.height,
      x: 0,
      y: 0,
      bounds: {
        minX: -eda.board.width / 2,
        maxX: eda.board.width / 2,
        minY: -eda.board.height / 2,
        maxY: eda.board.height / 2
      }
    });
    layers.add("Edge.Cuts");
  }

  // Add traces (simplified - would need actual routing data)
  for (const netClass of eda.netClasses || []) {
    if (netClass.traceWidth && netClass.traceWidth > 0) {
      // Estimate some traces for DRC checking
      objects.push({
        type: "trace",
        netClass: netClass.name,
        width: netClass.traceWidth,
        layer: "F.Cu"
      });
      layers.add("F.Cu");
    }
  }

  return {
    objects,
    layers: Array.from(layers)
  };
}

/**
 * Check a specific DRC rule
 */
function checkDrcRule(rule: DrcRule, eda: EdaSpecV1, geometricData: any): DrcViolation[] {
  const violations: DrcViolation[] = [];

  switch (rule.id) {
    case "drc_001": // Minimum Track Width
      violations.push(...checkMinTrackWidth(eda, geometricData, rule));
      break;

    case "drc_002": // Minimum Track Spacing
      violations.push(...checkTrackSpacing(eda, geometricData, rule));
      break;

    case "drc_003": // Minimum Via Size
      violations.push(...checkMinViaSize(eda, geometricData, rule));
      break;

    case "drc_004": // Via to Via Spacing
      violations.push(...checkViaSpacing(eda, geometricData, rule));
      break;

    case "drc_005": // Minimum Drill Size
      violations.push(...checkMinDrillSize(eda, geometricData, rule));
      break;

    case "drc_006": // Copper to Board Edge
      violations.push(...checkCopperToBoardEdge(eda, geometricData, rule));
      break;

    case "drc_007": // Solder Mask Expansion
      violations.push(...checkSolderMaskExpansion(eda, geometricData, rule));
      break;

    case "drc_008": // Silkscreen to Copper Spacing
      violations.push(...checkSilkscreenSpacing(eda, geometricData, rule));
      break;

    case "drc_009": // Component Courtyard Overlap
      violations.push(...checkCourtyardOverlap(eda, geometricData, rule));
      break;

    case "drc_010": // Minimum Annular Ring
      violations.push(...checkAnnularRing(eda, geometricData, rule));
      break;

    default:
      // Rule not implemented
      break;
  }

  return violations;
}

/**
 * Check minimum track width
 */
function checkMinTrackWidth(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  const minWidth = rule.value || 0.1;

  for (const netClass of eda.netClasses || []) {
    if (netClass.traceWidth && netClass.traceWidth < minWidth) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Net class "${netClass.name}" trace width ${netClass.traceWidth}mm is below minimum ${minWidth}mm`,
        location: { x: 0, y: 0 },
        objects: [netClass.name],
        measured: netClass.traceWidth,
        expected: minWidth,
        unit: "mm",
        suggestion: `Increase trace width to at least ${minWidth}mm`
      });
    }
  }

  return violations;
}

/**
 * Check track spacing
 */
function checkTrackSpacing(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  const minSpacing = rule.value || 0.1;

  for (const netClass of eda.netClasses || []) {
    if (netClass.clearance && netClass.clearance < minSpacing) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Net class "${netClass.name}" clearance ${netClass.clearance}mm is below minimum ${minSpacing}mm`,
        location: { x: 0, y: 0 },
        objects: [netClass.name],
        measured: netClass.clearance,
        expected: minSpacing,
        unit: "mm",
        suggestion: `Increase clearance to at least ${minSpacing}mm`
      });
    }
  }

  return violations;
}

/**
 * Check minimum via size
 */
function checkMinViaSize(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  const minViaSize = rule.value || 0.15;

  for (const netClass of eda.netClasses || []) {
    if (netClass.viaSize && netClass.viaSize < minViaSize) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Net class "${netClass.name}" via size ${netClass.viaSize}mm is below minimum ${minViaSize}mm`,
        location: { x: 0, y: 0 },
        objects: [netClass.name],
        measured: netClass.viaSize,
        expected: minViaSize,
        unit: "mm",
        suggestion: `Increase via size to at least ${minViaSize}mm`
      });
    }
  }

  return violations;
}

/**
 * Check via spacing
 */
function checkViaSpacing(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  // This would require actual via placement data
  // For now, just check if spacing rules are defined
  return violations;
}

/**
 * Check minimum drill size
 */
function checkMinDrillSize(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  const minDrill = rule.value || 0.1;

  // Check component through-hole pins
  for (const component of eda.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    if (placement && isThroughHoleComponent(component.footprint)) {
      // Estimate drill size from footprint
      const estimatedDrill = estimateDrillSize(component.footprint);
      if (estimatedDrill > 0 && estimatedDrill < minDrill) {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Component ${component.ref} estimated drill size ${estimatedDrill}mm is below minimum ${minDrill}mm`,
          location: { x: placement.x, y: placement.y },
          objects: [component.ref],
          measured: estimatedDrill,
          expected: minDrill,
          unit: "mm",
          suggestion: `Use larger drill size or check footprint specification`
        });
      }
    }
  }

  return violations;
}

/**
 * Check copper to board edge spacing
 */
function checkCopperToBoardEdge(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  const minDistance = rule.value || 0.2;

  if (!eda.board) return violations;

  const boardW = eda.board.width / 2;
  const boardH = eda.board.height / 2;

  // Check components near board edge
  for (const component of eda.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    if (!placement) continue;

    const bounds = estimateComponentBounds(component.footprint, placement);
    
    // Check distance to each board edge
    const distToLeft = bounds.minX - (-boardW);
    const distToRight = boardW - bounds.maxX;
    const distToBottom = bounds.minY - (-boardH);
    const distToTop = boardH - bounds.maxY;
    
    const minDist = Math.min(distToLeft, distToRight, distToBottom, distToTop);
    
    if (minDist < minDistance && minDist > -minDistance) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Component ${component.ref} is ${minDist.toFixed(3)}mm from board edge (minimum ${minDistance}mm)`,
        location: { x: placement.x, y: placement.y },
        objects: [component.ref, "board_edge"],
        measured: minDist,
        expected: minDistance,
        unit: "mm",
        suggestion: `Move component at least ${minDistance}mm from board edge`
      });
    }
  }

  return violations;
}

/**
 * Check solder mask expansion
 */
function checkSolderMaskExpansion(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  // This would require detailed pad geometry data
  // For now, return empty array
  return violations;
}

/**
 * Check silkscreen spacing
 */
function checkSilkscreenSpacing(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  // This would require silkscreen geometry data
  // For now, return empty array
  return violations;
}

/**
 * Check component courtyard overlap
 */
function checkCourtyardOverlap(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];

  const components = eda.components.map(comp => {
    const placement = eda.placement?.find(p => p.ref === comp.ref);
    return placement ? {
      ref: comp.ref,
      bounds: estimateComponentBounds(comp.footprint, placement),
      placement
    } : null;
  }).filter(Boolean);

  // Check all pairs for overlap
  for (let i = 0; i < components.length; i++) {
    for (let j = i + 1; j < components.length; j++) {
      const comp1 = components[i]!;
      const comp2 = components[j]!;
      
      if (boundsOverlap(comp1.bounds, comp2.bounds)) {
        const centerX = (comp1.placement.x + comp2.placement.x) / 2;
        const centerY = (comp1.placement.y + comp2.placement.y) / 2;
        
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Component courtyards overlap: ${comp1.ref} and ${comp2.ref}`,
          location: { x: centerX, y: centerY },
          objects: [comp1.ref, comp2.ref],
          suggestion: `Move components to eliminate courtyard overlap`
        });
      }
    }
  }

  return violations;
}

/**
 * Check annular ring
 */
function checkAnnularRing(eda: EdaSpecV1, geometricData: any, rule: DrcRule): DrcViolation[] {
  const violations: DrcViolation[] = [];
  // This would require detailed pad and drill data
  // For now, return empty array
  return violations;
}

// Helper functions

function adjustRulesForFabClass(rules: DrcRule[], fabricationClass?: string): DrcRule[] {
  if (!fabricationClass) return rules;

  return rules.map(rule => {
    const adjusted = { ...rule };
    
    switch (fabricationClass) {
      case "prototype":
        // Relaxed rules for prototyping
        if (rule.value) adjusted.value = rule.value * 0.8;
        break;
      case "production":
        // Standard rules
        break;
      case "high_density":
        // Tighter rules for HDI
        if (rule.value) adjusted.value = rule.value * 1.5;
        break;
    }
    
    return adjusted;
  });
}

function estimateComponentBounds(footprint: string | undefined, placement: any): any {
  if (!footprint || !placement) {
    return { minX: placement?.x || 0, maxX: placement?.x || 0, minY: placement?.y || 0, maxY: placement?.y || 0 };
  }

  const fp = footprint.toLowerCase();
  let width = 5, height = 5; // Default size in mm

  // Estimate size based on footprint name
  if (fp.includes("0603")) { width = 1.6; height = 0.8; }
  else if (fp.includes("0805")) { width = 2.0; height = 1.25; }
  else if (fp.includes("1206")) { width = 3.2; height = 1.6; }
  else if (fp.includes("soic-8")) { width = 5.0; height = 4.0; }
  else if (fp.includes("dip")) { width = 15.24; height = 7.62; }
  else if (fp.includes("qfn")) { width = 5.0; height = 5.0; }

  // Add courtyard margin
  const margin = 0.25;
  const hw = (width + margin) / 2;
  const hh = (height + margin) / 2;

  return {
    minX: placement.x - hw,
    maxX: placement.x + hw,
    minY: placement.y - hh,
    maxY: placement.y + hh
  };
}

function isThroughHoleComponent(footprint?: string): boolean {
  if (!footprint) return false;
  const fp = footprint.toLowerCase();
  return fp.includes("tht") || fp.includes("dip") || fp.includes("through");
}

function estimateDrillSize(footprint?: string): number {
  if (!footprint) return 0;
  const fp = footprint.toLowerCase();
  
  if (fp.includes("dip")) return 0.8; // Standard DIP drill
  if (fp.includes("tht")) return 0.6; // Standard THT drill
  
  return 0; // SMD component
}

function boundsOverlap(bounds1: any, bounds2: any): boolean {
  return !(bounds1.maxX < bounds2.minX || 
           bounds2.maxX < bounds1.minX || 
           bounds1.maxY < bounds2.minY || 
           bounds2.maxY < bounds1.minY);
}

/**
 * Generate DRC report summary
 */
export function generateDrcReport(result: DrcResult): string {
  const lines: string[] = [];
  
  lines.push("=== Design Rules Check Report ===");
  lines.push("");
  lines.push(`Status: ${result.passed ? "PASSED" : "FAILED"}`);
  lines.push(`Execution time: ${result.executionTime}ms`);
  lines.push("");
  
  lines.push("Statistics:");
  lines.push(`  Rules checked: ${result.stats.rulesChecked}`);
  lines.push(`  Objects: ${result.stats.objectsChecked}`);
  lines.push(`  Layers: ${result.stats.layersChecked}`);
  lines.push(`  Errors: ${result.stats.errors}`);
  lines.push(`  Warnings: ${result.stats.warnings}`);
  lines.push(`  Info: ${result.stats.info}`);
  lines.push("");

  if (result.violations.length > 0) {
    lines.push("Violations:");
    lines.push("");
    
    const errors = result.violations.filter(v => v.severity === "error");
    const warnings = result.violations.filter(v => v.severity === "warning");
    const info = result.violations.filter(v => v.severity === "info");

    if (errors.length > 0) {
      lines.push("ERRORS:");
      for (const violation of errors) {
        lines.push(`  ${violation.ruleId}: ${violation.message}`);
        if (violation.measured !== undefined && violation.expected !== undefined) {
          lines.push(`    Measured: ${violation.measured}${violation.unit}, Expected: ${violation.expected}${violation.unit}`);
        }
        if (violation.suggestion) {
          lines.push(`    Suggestion: ${violation.suggestion}`);
        }
      }
      lines.push("");
    }

    if (warnings.length > 0) {
      lines.push("WARNINGS:");
      for (const violation of warnings) {
        lines.push(`  ${violation.ruleId}: ${violation.message}`);
        if (violation.measured !== undefined && violation.expected !== undefined) {
          lines.push(`    Measured: ${violation.measured}${violation.unit}, Expected: ${violation.expected}${violation.unit}`);
        }
        if (violation.suggestion) {
          lines.push(`    Suggestion: ${violation.suggestion}`);
        }
      }
      lines.push("");
    }

    if (info.length > 0) {
      lines.push("INFO:");
      for (const violation of info) {
        lines.push(`  ${violation.ruleId}: ${violation.message}`);
      }
    }
  } else {
    lines.push("No violations found.");
  }

  return lines.join("\n");
}