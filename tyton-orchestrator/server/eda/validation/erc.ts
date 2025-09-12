import type { EdaSpecV1 } from "../specs/edaSpecV10";
import { buildNeutralNetlist, validateNetlist } from "../build/netlist";

export interface ErcRule {
  id: string;
  name: string;
  description: string;
  category: "power" | "signal" | "connectivity" | "component";
  severity: "error" | "warning" | "info";
  enabled: boolean;
}

export interface ErcViolation {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  component?: string;
  net?: string;
  pin?: string;
  location?: { x: number; y: number };
  suggestion?: string;
}

export interface ErcResult {
  passed: boolean;
  violations: ErcViolation[];
  stats: {
    errors: number;
    warnings: number;
    info: number;
    rulesChecked: number;
    componentsChecked: number;
    netsChecked: number;
  };
  executionTime: number;
}

// Standard ERC rules
export const DEFAULT_ERC_RULES: ErcRule[] = [
  {
    id: "erc_001",
    name: "Unconnected Pin",
    description: "Input or bidirectional pins must be connected",
    category: "connectivity",
    severity: "warning",
    enabled: true
  },
  {
    id: "erc_002", 
    name: "Power Pin Not Connected",
    description: "Power pins must be connected to power nets",
    category: "power",
    severity: "error",
    enabled: true
  },
  {
    id: "erc_003",
    name: "Multiple Output Drivers",
    description: "Net has multiple output drivers",
    category: "signal",
    severity: "error",
    enabled: true
  },
  {
    id: "erc_004",
    name: "No Ground Connection",
    description: "Circuit must have at least one ground connection",
    category: "power",
    severity: "error",
    enabled: true
  },
  {
    id: "erc_005",
    name: "Missing Power Supply",
    description: "Active components require power supply connections",
    category: "power",
    severity: "warning",
    enabled: true
  },
  {
    id: "erc_006",
    name: "Single Pin Net",
    description: "Net connects to only one pin",
    category: "connectivity",
    severity: "warning",
    enabled: true
  },
  {
    id: "erc_007",
    name: "Hierarchical Label Mismatch",
    description: "Hierarchical labels must match between sheets",
    category: "signal",
    severity: "error",
    enabled: false // Not applicable for flat designs
  },
  {
    id: "erc_008",
    name: "Pin Type Mismatch", 
    description: "Incompatible pin types connected",
    category: "signal",
    severity: "warning",
    enabled: true
  },
  {
    id: "erc_009",
    name: "Unused Gate",
    description: "Logic gate inputs are unused and floating",
    category: "component",
    severity: "warning",
    enabled: true
  },
  {
    id: "erc_010",
    name: "High Fanout",
    description: "Output drives too many inputs",
    category: "signal",
    severity: "warning",
    enabled: true
  }
];

/**
 * Run Electrical Rules Check on EDA specification
 */
export function runErc(
  eda: EdaSpecV1, 
  rules: ErcRule[] = DEFAULT_ERC_RULES,
  options: { stopOnError?: boolean } = {}
): ErcResult {
  const startTime = Date.now();
  const violations: ErcViolation[] = [];
  const enabledRules = rules.filter(rule => rule.enabled);

  // Build netlist for analysis
  const netlist = buildNeutralNetlist({
    version: "1.2",
    components: eda.components,
    nets: [],
    metadata: {}
  });

  // Run each enabled rule
  for (const rule of enabledRules) {
    const ruleViolations = checkRule(rule, eda, netlist);
    violations.push(...ruleViolations);

    if (options.stopOnError && ruleViolations.some(v => v.severity === "error")) {
      break;
    }
  }

  const stats = {
    errors: violations.filter(v => v.severity === "error").length,
    warnings: violations.filter(v => v.severity === "warning").length,
    info: violations.filter(v => v.severity === "info").length,
    rulesChecked: enabledRules.length,
    componentsChecked: eda.components.length,
    netsChecked: netlist.nets.length
  };

  return {
    passed: stats.errors === 0,
    violations,
    stats,
    executionTime: Date.now() - startTime
  };
}

/**
 * Check a specific ERC rule
 */
function checkRule(rule: ErcRule, eda: EdaSpecV1, netlist: any): ErcViolation[] {
  const violations: ErcViolation[] = [];

  switch (rule.id) {
    case "erc_001": // Unconnected Pin
      violations.push(...checkUnconnectedPins(eda, netlist, rule));
      break;

    case "erc_002": // Power Pin Not Connected  
      violations.push(...checkPowerPinConnections(eda, netlist, rule));
      break;

    case "erc_003": // Multiple Output Drivers
      violations.push(...checkMultipleDrivers(eda, netlist, rule));
      break;

    case "erc_004": // No Ground Connection
      violations.push(...checkGroundConnection(eda, netlist, rule));
      break;

    case "erc_005": // Missing Power Supply
      violations.push(...checkPowerSupply(eda, netlist, rule));
      break;

    case "erc_006": // Single Pin Net
      violations.push(...checkSinglePinNets(eda, netlist, rule));
      break;

    case "erc_008": // Pin Type Mismatch
      violations.push(...checkPinTypeMismatch(eda, netlist, rule));
      break;

    case "erc_009": // Unused Gate
      violations.push(...checkUnusedGates(eda, netlist, rule));
      break;

    case "erc_010": // High Fanout
      violations.push(...checkHighFanout(eda, netlist, rule));
      break;

    default:
      // Rule not implemented
      break;
  }

  return violations;
}

/**
 * Check for unconnected pins
 */
function checkUnconnectedPins(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];

  for (const component of netlist.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    
    for (const pin of component.pins) {
      if (pin.net === "NC" && (pin.type === "input" || pin.type === "bidirectional")) {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Pin ${pin.number} (${pin.name || "unnamed"}) on ${component.ref} is unconnected`,
          component: component.ref,
          pin: pin.number,
          location: placement ? { x: placement.x, y: placement.y } : undefined,
          suggestion: "Connect pin to appropriate net or add no-connect flag"
        });
      }
    }
  }

  return violations;
}

/**
 * Check power pin connections
 */
function checkPowerPinConnections(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];
  const powerNets = new Set(netlist.nets
    .filter((net: any) => isPowerNet(net.name))
    .map((net: any) => net.name));

  for (const component of netlist.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    
    for (const pin of component.pins) {
      if (pin.type === "power" && pin.net === "NC") {
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Power pin ${pin.number} on ${component.ref} is not connected`,
          component: component.ref,
          pin: pin.number,
          location: placement ? { x: placement.x, y: placement.y } : undefined,
          suggestion: "Connect to appropriate power net"
        });
      } else if (pin.type === "power" && pin.net && !powerNets.has(pin.net)) {
        violations.push({
          ruleId: rule.id,
          severity: "warning",
          message: `Power pin ${pin.number} on ${component.ref} connected to non-power net "${pin.net}"`,
          component: component.ref,
          pin: pin.number,
          net: pin.net,
          location: placement ? { x: placement.x, y: placement.y } : undefined,
          suggestion: "Verify net is intended for power distribution"
        });
      }
    }
  }

  return violations;
}

/**
 * Check for multiple output drivers on same net
 */
function checkMultipleDrivers(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];

  for (const net of netlist.nets) {
    const outputDrivers = net.members.filter((member: any) => {
      const component = netlist.components.find((c: any) => c.ref === member.ref);
      const pin = component?.pins.find((p: any) => p.number === member.pin);
      return pin?.type === "output";
    });

    if (outputDrivers.length > 1) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Net "${net.name}" has ${outputDrivers.length} output drivers: ${outputDrivers.map((d: any) => d.ref).join(", ")}`,
        net: net.name,
        suggestion: "Use tri-state drivers, buffer, or open-collector/drain outputs"
      });
    }
  }

  return violations;
}

/**
 * Check for ground connection
 */
function checkGroundConnection(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];
  const hasGround = netlist.nets.some((net: any) => isGroundNet(net.name));

  if (!hasGround) {
    violations.push({
      ruleId: rule.id,
      severity: rule.severity,
      message: "No ground net found in design",
      suggestion: "Add ground net (GND, GROUND, VSS, etc.)"
    });
  }

  return violations;
}

/**
 * Check for power supply connections
 */
function checkPowerSupply(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];
  
  // Check if active components have power connections
  for (const component of netlist.components) {
    if (isActiveComponent(component)) {
      const powerPins = component.pins.filter((pin: any) => pin.type === "power");
      const connectedPowerPins = powerPins.filter((pin: any) => pin.net && pin.net !== "NC");
      
      if (powerPins.length > 0 && connectedPowerPins.length === 0) {
        const placement = eda.placement?.find(p => p.ref === component.ref);
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Active component ${component.ref} has no power connections`,
          component: component.ref,
          location: placement ? { x: placement.x, y: placement.y } : undefined,
          suggestion: "Connect VCC, VDD, or other power pins"
        });
      }
    }
  }

  return violations;
}

/**
 * Check for single pin nets
 */
function checkSinglePinNets(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];

  for (const net of netlist.nets) {
    if (net.members.length === 1 && !isSpecialNet(net.name)) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Net "${net.name}" connects to only one pin: ${net.members[0].ref}.${net.members[0].pin}`,
        net: net.name,
        component: net.members[0].ref,
        pin: net.members[0].pin,
        suggestion: "Connect to additional pins or remove net"
      });
    }
  }

  return violations;
}

/**
 * Check for pin type mismatches
 */
function checkPinTypeMismatch(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];

  for (const net of netlist.nets) {
    if (net.members.length < 2) continue;

    const pinTypes = net.members.map((member: any) => {
      const component = netlist.components.find((c: any) => c.ref === member.ref);
      const pin = component?.pins.find((p: any) => p.number === member.pin);
      return { ref: member.ref, pin: member.pin, type: pin?.type || "passive" };
    });

    // Check for problematic combinations
    const outputs = pinTypes.filter(p => p.type === "output");
    const inputs = pinTypes.filter(p => p.type === "input");

    if (outputs.length === 0 && inputs.length > 0) {
      violations.push({
        ruleId: rule.id,
        severity: "warning",
        message: `Net "${net.name}" has input pins but no driver: ${inputs.map(p => `${p.ref}.${p.pin}`).join(", ")}`,
        net: net.name,
        suggestion: "Add output driver or pull-up/pull-down resistor"
      });
    }
  }

  return violations;
}

/**
 * Check for unused logic gates
 */
function checkUnusedGates(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];

  for (const component of netlist.components) {
    if (isLogicGate(component)) {
      const inputPins = component.pins.filter((pin: any) => pin.type === "input");
      const unconnectedInputs = inputPins.filter((pin: any) => pin.net === "NC");

      if (unconnectedInputs.length > 0) {
        const placement = eda.placement?.find(p => p.ref === component.ref);
        violations.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Logic gate ${component.ref} has ${unconnectedInputs.length} unconnected inputs`,
          component: component.ref,
          location: placement ? { x: placement.x, y: placement.y } : undefined,
          suggestion: "Connect unused inputs to VCC, GND, or tie appropriately"
        });
      }
    }
  }

  return violations;
}

/**
 * Check for high fanout
 */
function checkHighFanout(eda: EdaSpecV1, netlist: any, rule: ErcRule): ErcViolation[] {
  const violations: ErcViolation[] = [];
  const maxFanout = 10; // Configurable threshold

  for (const net of netlist.nets) {
    const inputLoads = net.members.filter((member: any) => {
      const component = netlist.components.find((c: any) => c.ref === member.ref);
      const pin = component?.pins.find((p: any) => p.number === member.pin);
      return pin?.type === "input";
    });

    if (inputLoads.length > maxFanout) {
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: `Net "${net.name}" has high fanout: ${inputLoads.length} loads (max recommended: ${maxFanout})`,
        net: net.name,
        suggestion: "Use buffer/driver to reduce loading"
      });
    }
  }

  return violations;
}

// Helper functions

function isPowerNet(netName: string): boolean {
  const name = netName.toLowerCase();
  return name.includes("vcc") || name.includes("vdd") || name.includes("vbus") ||
         name.includes("power") || name.includes("5v") || name.includes("3v3") ||
         name.includes("12v") || name.includes("24v");
}

function isGroundNet(netName: string): boolean {
  const name = netName.toLowerCase();
  return name.includes("gnd") || name.includes("ground") || name.includes("vss") ||
         name === "0v" || name === "earth";
}

function isActiveComponent(component: any): boolean {
  const ref = component.ref.toLowerCase();
  return ref.startsWith("u") || ref.startsWith("ic") || ref.startsWith("q") ||
         component.attributes?.role?.toLowerCase().includes("mcu") ||
         component.attributes?.role?.toLowerCase().includes("processor") ||
         component.attributes?.role?.toLowerCase().includes("amplifier");
}

function isLogicGate(component: any): boolean {
  const value = (component.value || "").toLowerCase();
  const footprint = (component.footprint || "").toLowerCase();
  
  return value.includes("gate") || value.includes("buffer") || value.includes("inverter") ||
         footprint.includes("74") || component.ref.toLowerCase().startsWith("u");
}

function isSpecialNet(netName: string): boolean {
  const name = netName.toLowerCase();
  return name.includes("testpoint") || name.includes("test") || 
         name.includes("flag") || name.includes("nc") || 
         name === "";
}

/**
 * Generate ERC report summary
 */
export function generateErcReport(result: ErcResult): string {
  const lines: string[] = [];
  
  lines.push("=== Electrical Rules Check Report ===");
  lines.push("");
  lines.push(`Status: ${result.passed ? "PASSED" : "FAILED"}`);
  lines.push(`Execution time: ${result.executionTime}ms`);
  lines.push("");
  
  lines.push("Statistics:");
  lines.push(`  Rules checked: ${result.stats.rulesChecked}`);
  lines.push(`  Components: ${result.stats.componentsChecked}`);
  lines.push(`  Nets: ${result.stats.netsChecked}`);
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