import type { SchematicSpec } from "@/server/validation/schematicSpecValidator";

export interface NeutralNetlist {
  components: NeutralComponent[];
  nets: NeutralNet[];
  metadata: {
    generator: string;
    version: string;
    timestamp: string;
    source: string;
  };
}

export interface NeutralComponent {
  ref: string;                    // e.g., "U1", "R5"
  value?: string;                 // e.g., "10k", "STM32F103"
  footprint?: string;             // KiCad footprint reference
  pins: NeutralPin[];
  attributes?: Record<string, any>;
}

export interface NeutralPin {
  number: string;                 // Pin number/name
  name?: string;                  // Pin function name
  net: string;                    // Net name
  type?: "input" | "output" | "bidirectional" | "power" | "passive";
}

export interface NeutralNet {
  name: string;
  members: NetMember[];
  netclass?: string;              // Net class assignment
  attributes?: Record<string, any>;
}

export interface NetMember {
  ref: string;                    // Component reference
  pin: string;                    // Pin number/name
}

export interface NetlistValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    components: number;
    nets: number;
    connections: number;
    unconnected: number;
  };
}

/**
 * Build neutral netlist from schematic spec v1.2
 */
export function buildNeutralNetlist(spec: SchematicSpec, source = "tyton-orchestrator"): NeutralNetlist {
  const components: NeutralComponent[] = [];
  const netMap = new Map<string, NeutralNet>();

  // Process components and their pins
  for (const component of spec.components || []) {
    const neutralComp: NeutralComponent = {
      ref: component.ref,
      value: component.value,
      footprint: component.footprint,
      pins: [],
      attributes: {
        role: component.role,
        mpn: component.mpn,
        ...component.attributes
      }
    };

    // Process pins
    for (const pin of component.pins || []) {
      const pinNumber = pin.number?.toString() || pin.name || "1";
      const netName = pin.net || "NC";
      
      neutralComp.pins.push({
        number: pinNumber,
        name: pin.name,
        net: netName,
        type: inferPinType(pin.name, netName)
      });

      // Add to net map
      if (netName !== "NC") {
        if (!netMap.has(netName)) {
          netMap.set(netName, {
            name: netName,
            members: [],
            netclass: inferNetClass(netName),
            attributes: {}
          });
        }
        
        netMap.get(netName)!.members.push({
          ref: component.ref,
          pin: pinNumber
        });
      }
    }

    components.push(neutralComp);
  }

  // Convert net map to array
  const nets = Array.from(netMap.values());

  return {
    components,
    nets,
    metadata: {
      generator: "tyton-orchestrator",
      version: "1.0",
      timestamp: new Date().toISOString(),
      source
    }
  };
}

/**
 * Validate netlist for common issues
 */
export function validateNetlist(netlist: NeutralNetlist): NetlistValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let unconnected = 0;

  // Check each net
  for (const net of netlist.nets) {
    // Nets should have at least 2 members (except test points, power flags)
    if (net.members.length < 2) {
      if (!isSpecialNet(net.name)) {
        warnings.push(`Net "${net.name}" has only ${net.members.length} connection(s)`);
      }
    }

    // Check for invalid net names
    if (net.name.includes(" ") || net.name.includes("/") || net.name.includes("\\")) {
      errors.push(`Net "${net.name}" contains invalid characters`);
    }

    // Check for duplicate connections
    const memberSet = new Set();
    for (const member of net.members) {
      const key = `${member.ref}.${member.pin}`;
      if (memberSet.has(key)) {
        errors.push(`Duplicate connection: ${key} on net "${net.name}"`);
      }
      memberSet.add(key);
    }
  }

  // Check components
  for (const component of netlist.components) {
    // Check for unconnected pins
    const ncPins = component.pins.filter(p => p.net === "NC");
    if (ncPins.length > 0) {
      unconnected += ncPins.length;
      
      // Warn about unconnected inputs
      const unconnectedInputs = ncPins.filter(p => p.type === "input");
      if (unconnectedInputs.length > 0) {
        warnings.push(`${component.ref} has unconnected inputs: ${unconnectedInputs.map(p => p.number).join(", ")}`);
      }
    }

    // Check for missing footprints
    if (!component.footprint || component.footprint === "TBD") {
      warnings.push(`${component.ref} is missing footprint assignment`);
    }

    // Check for duplicate pin numbers
    const pinNumbers = component.pins.map(p => p.number);
    const uniquePins = new Set(pinNumbers);
    if (pinNumbers.length !== uniquePins.size) {
      errors.push(`${component.ref} has duplicate pin numbers`);
    }
  }

  // Check for essential nets
  const netNames = netlist.nets.map(n => n.name.toLowerCase());
  if (!netNames.some(n => n.includes("gnd") || n.includes("ground"))) {
    warnings.push("No ground net found");
  }
  if (!netNames.some(n => n.includes("vcc") || n.includes("vdd") || n.includes("power"))) {
    warnings.push("No power net found");
  }

  const stats = {
    components: netlist.components.length,
    nets: netlist.nets.length,
    connections: netlist.nets.reduce((sum, net) => sum + net.members.length, 0),
    unconnected
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats
  };
}

/**
 * Write KiCad-compatible netlist
 */
export function writeKiCadNetlist(netlist: NeutralNetlist): string {
  const lines: string[] = [];
  
  // Header
  lines.push("(export (version D)");
  lines.push("  (design");
  lines.push(`    (source "${netlist.metadata.source}")`);
  lines.push(`    (date "${netlist.metadata.timestamp}")`);
  lines.push(`    (tool "${netlist.metadata.generator} ${netlist.metadata.version}")`);
  lines.push("  )");

  // Components
  lines.push("  (components");
  for (const component of netlist.components) {
    lines.push(`    (comp (ref "${component.ref}")`);
    if (component.value) {
      lines.push(`      (value "${component.value}")`);
    }
    if (component.footprint) {
      lines.push(`      (footprint "${component.footprint}")`);
    }
    
    // Add attributes as fields
    if (component.attributes) {
      for (const [key, value] of Object.entries(component.attributes)) {
        if (value && key !== "footprint") {
          lines.push(`      (field (name "${key}") "${value}")`);
        }
      }
    }
    
    lines.push("    )");
  }
  lines.push("  )");

  // Nets
  lines.push("  (nets");
  let netCode = 1;
  
  for (const net of netlist.nets) {
    lines.push(`    (net (code ${netCode}) (name "${net.name}")`);
    
    for (const member of net.members) {
      lines.push(`      (node (ref "${member.ref}") (pin "${member.pin}"))`);
    }
    
    lines.push("    )");
    netCode++;
  }
  
  lines.push("  )");
  lines.push(")");

  return lines.join("\n");
}

/**
 * Write neutral netlist as JSON
 */
export function writeNeutralNetlistJson(netlist: NeutralNetlist): string {
  return JSON.stringify(netlist, null, 2);
}

/**
 * Generate netlist statistics
 */
export function getNetlistStats(netlist: NeutralNetlist): {
  summary: string;
  details: {
    components: { ref: string; pins: number; value?: string }[];
    nets: { name: string; connections: number; netclass?: string }[];
    powerNets: string[];
    signalNets: string[];
    unconnectedPins: { ref: string; pin: string }[];
  };
} {
  const components = netlist.components.map(c => ({
    ref: c.ref,
    pins: c.pins.length,
    value: c.value
  }));

  const nets = netlist.nets.map(n => ({
    name: n.name,
    connections: n.members.length,
    netclass: n.netclass
  }));

  const powerNets = nets.filter(n => 
    n.netclass === "POWER" || 
    n.name.toLowerCase().includes("vcc") ||
    n.name.toLowerCase().includes("vdd") ||
    n.name.toLowerCase().includes("power")
  ).map(n => n.name);

  const signalNets = nets.filter(n => 
    n.netclass === "SIGNAL" && !powerNets.includes(n.name)
  ).map(n => n.name);

  const unconnectedPins: { ref: string; pin: string }[] = [];
  for (const component of netlist.components) {
    for (const pin of component.pins) {
      if (pin.net === "NC") {
        unconnectedPins.push({ ref: component.ref, pin: pin.number });
      }
    }
  }

  const summary = `${components.length} components, ${nets.length} nets, ${powerNets.length} power nets, ${unconnectedPins.length} unconnected pins`;

  return {
    summary,
    details: {
      components,
      nets,
      powerNets,
      signalNets,
      unconnectedPins
    }
  };
}

// Helper functions
function inferPinType(pinName?: string, netName?: string): "input" | "output" | "bidirectional" | "power" | "passive" {
  if (!pinName && !netName) return "passive";
  
  const name = (pinName || netName || "").toLowerCase();
  
  if (name.includes("vcc") || name.includes("vdd") || name.includes("gnd") || name.includes("power")) {
    return "power";
  }
  
  if (name.includes("out") || name.includes("tx") || name.includes("mosi")) {
    return "output";
  }
  
  if (name.includes("in") || name.includes("rx") || name.includes("miso")) {
    return "input";
  }
  
  if (name.includes("sda") || name.includes("scl") || name.includes("data") || name.includes("clk")) {
    return "bidirectional";
  }
  
  return "passive";
}

function inferNetClass(netName: string): string {
  const name = netName.toLowerCase();
  
  if (name.includes("gnd") || name.includes("ground")) {
    return "GND";
  }
  
  if (name.includes("vcc") || name.includes("vdd") || name.includes("vbus") || 
      name.includes("5v") || name.includes("3v3") || name.includes("12v")) {
    return "POWER";
  }
  
  if (name.includes("usb") || name.includes("diff")) {
    return "USB";
  }
  
  return "SIGNAL";
}

function isSpecialNet(netName: string): boolean {
  const name = netName.toLowerCase();
  return name.includes("testpoint") || 
         name.includes("test") || 
         name.includes("flag") ||
         name.includes("nc") ||
         name === "";
}