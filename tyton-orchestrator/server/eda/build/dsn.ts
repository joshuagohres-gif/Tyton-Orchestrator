import type { EdaSpecV1 } from "../specs/edaSpecV10";
import { buildNeutralNetlist } from "./netlist";

export interface DsnExportOptions {
  units?: "mm" | "mil";
  resolution?: number;
  minTraceWidth?: number;
  minViaSize?: number;
  layerCount?: number;
  boardThickness?: number;
}

/**
 * Generate Specctra DSN file for freerouting
 * DSN format is used by freerouting for PCB autorouting
 */
export function generateDsn(
  eda: EdaSpecV1,
  options: DsnExportOptions = {}
): string {
  const opts = {
    units: "mm" as const,
    resolution: 2540, // 0.1 mil resolution in 1/254000 inch
    minTraceWidth: 0.15, // mm
    minViaSize: 0.2, // mm
    layerCount: 2,
    boardThickness: 1.6, // mm
    ...options
  };

  const netlist = buildNeutralNetlist({
    version: "1.2",
    components: eda.components,
    nets: [],
    metadata: {}
  });

  const lines: string[] = [];

  // DSN header
  lines.push("(PCB \"Tyton Generated Board\"");
  lines.push("  (parser");
  lines.push("    (string_quote \\\")");
  lines.push("    (space_in_quoted_tokens on)");
  lines.push("    (host_cad KiCad)");
  lines.push("    (host_version \"6.0.0\")");
  lines.push("  )");

  // Resolution and units
  lines.push("  (resolution " + opts.units + " " + opts.resolution + ")");
  lines.push("  (unit " + opts.units + ")");

  // Structure (layers)
  lines.push("  (structure");
  lines.push("    (layer F.Cu (type signal) (index 0))");
  if (opts.layerCount >= 2) {
    lines.push("    (layer B.Cu (type signal) (index 1))");
  }
  if (opts.layerCount >= 4) {
    lines.push("    (layer In1.Cu (type signal) (index 2))");
    lines.push("    (layer In2.Cu (type signal) (index 3))");
  }
  lines.push("    (boundary");
  
  // Board outline (rectangle for now)
  const boardWidth = eda.board?.width || 100;
  const boardHeight = eda.board?.height || 80;
  const outline = generateBoardOutline(boardWidth, boardHeight);
  lines.push("      " + outline);
  lines.push("    )");
  
  // Via definition
  lines.push("    (via");
  lines.push("      \"Via[0-" + (opts.layerCount - 1) + "]_" + opts.minViaSize + ":" + (opts.minViaSize + 0.1) + "_um\"");
  lines.push("      (shape (circle F.Cu " + opts.minViaSize + "))");
  lines.push("      (shape (circle B.Cu " + opts.minViaSize + "))");
  lines.push("      (attach off)");
  lines.push("    )");
  
  // Rules
  lines.push("    (rule");
  lines.push("      (width " + opts.minTraceWidth + ")");
  lines.push("      (clearance " + (opts.minTraceWidth * 1.5) + ")");
  lines.push("      (clearance " + (opts.minTraceWidth * 1.2) + " (type via_via))");
  lines.push("    )");
  
  lines.push("  )"); // End structure

  // Placement
  lines.push("  (placement");
  for (const component of eda.components) {
    const placement = eda.placement?.find(p => p.ref === component.ref);
    const x = placement?.x || 0;
    const y = placement?.y || 0;
    const rotation = placement?.rotation || 0;
    const side = placement?.side || "front";
    
    lines.push("    (component \"" + (component.footprint || "TBD") + "\"");
    lines.push("      (place \"" + component.ref + "\" " + x + " " + y + " " + (side === "front" ? "front" : "back") + " " + rotation + ")");
    lines.push("    )");
  }
  lines.push("  )"); // End placement

  // Library (component definitions)
  lines.push("  (library");
  const uniqueFootprints = [...new Set(eda.components.map(c => c.footprint).filter(Boolean))];
  for (const footprint of uniqueFootprints) {
    lines.push("    (image \"" + footprint + "\"");
    
    // Generate pad definitions for this footprint
    const component = eda.components.find(c => c.footprint === footprint);
    if (component?.pins) {
      for (const pin of component.pins) {
        const padSize = inferPadSize(footprint, pin.number);
        lines.push("      (pin \"" + pin.number + "\" " + padSize.shape + " \"" + pin.number + "\" " + padSize.x + " " + padSize.y + ")");
      }
    }
    
    lines.push("    )");
  }
  lines.push("  )"); // End library

  // Network (nets and connections)
  lines.push("  (network");
  
  // Net classes
  for (const netClass of eda.netClasses || []) {
    lines.push("    (class \"" + netClass.name + "\"");
    lines.push("      (rule (width " + (netClass.traceWidth || opts.minTraceWidth) + "))");
    lines.push("      (rule (clearance " + (netClass.clearance || opts.minTraceWidth * 1.5) + "))");
    
    // Add nets to class
    const classNets = netlist.nets.filter(net => net.netclass === netClass.name);
    for (const net of classNets) {
      lines.push("      \"" + net.name + "\"");
    }
    lines.push("    )");
  }
  
  // Default class for remaining nets
  const classifiedNets = new Set((eda.netClasses || []).flatMap(nc => 
    netlist.nets.filter(net => net.netclass === nc.name).map(net => net.name)
  ));
  const unclassifiedNets = netlist.nets.filter(net => !classifiedNets.has(net.name));
  
  if (unclassifiedNets.length > 0) {
    lines.push("    (class \"Default\"");
    lines.push("      (rule (width " + opts.minTraceWidth + "))");
    lines.push("      (rule (clearance " + (opts.minTraceWidth * 1.5) + "))");
    for (const net of unclassifiedNets) {
      lines.push("      \"" + net.name + "\"");
    }
    lines.push("    )");
  }

  // Net definitions with connections
  for (const net of netlist.nets) {
    if (net.members.length < 2) continue; // Skip unconnected nets
    
    lines.push("    (net \"" + net.name + "\"");
    lines.push("      (pins");
    for (const member of net.members) {
      lines.push("        \"" + member.ref + "-" + member.pin + "\"");
    }
    lines.push("      )");
    lines.push("    )");
  }
  
  lines.push("  )"); // End network
  lines.push(")"); // End PCB

  return lines.join("\n");
}

/**
 * Generate board outline as DSN path
 */
function generateBoardOutline(width: number, height: number): string {
  const x1 = -width / 2;
  const y1 = -height / 2;
  const x2 = width / 2;
  const y2 = height / 2;
  
  return `(path signal 0 ${x1} ${y1} ${x2} ${y1} ${x2} ${y2} ${x1} ${y2} ${x1} ${y1})`;
}

/**
 * Infer pad size and position from footprint and pin number
 */
function inferPadSize(footprint: string | undefined, pinNumber: string): {
  shape: string;
  x: number;
  y: number;
} {
  if (!footprint) {
    return { shape: "(circle 0.8)", x: 0, y: 0 };
  }

  const fp = footprint.toLowerCase();
  
  // SMD packages
  if (fp.includes("0603")) {
    const pinNum = parseInt(pinNumber) || 1;
    return {
      shape: "(rect 0.8 1.0)",
      x: pinNum === 1 ? -0.8 : 0.8,
      y: 0
    };
  }
  
  if (fp.includes("0805")) {
    const pinNum = parseInt(pinNumber) || 1;
    return {
      shape: "(rect 1.0 1.2)",
      x: pinNum === 1 ? -1.0 : 1.0,
      y: 0
    };
  }
  
  if (fp.includes("soic-8")) {
    const pinNum = parseInt(pinNumber) || 1;
    const side = pinNum <= 4 ? -1 : 1;
    const pos = pinNum <= 4 ? pinNum - 1 : 8 - pinNum;
    return {
      shape: "(rect 0.6 1.5)",
      x: side * 2.3,
      y: (pos - 1.5) * 1.27
    };
  }
  
  // Through-hole packages
  if (fp.includes("dip") || fp.includes("tht")) {
    const pinNum = parseInt(pinNumber) || 1;
    return {
      shape: "(circle 1.0)",
      x: (pinNum % 2 === 1) ? -1.27 : 1.27,
      y: Math.floor((pinNum - 1) / 2) * 2.54
    };
  }
  
  // Default pad
  return { shape: "(circle 0.8)", x: 0, y: 0 };
}

/**
 * Generate simplified DSN for quick routing
 */
export function generateSimpleDsn(eda: EdaSpecV1): string {
  const netlist = buildNeutralNetlist({
    version: "1.2",
    components: eda.components,
    nets: [],
    metadata: {}
  });

  const lines = [
    "(PCB \"Simple Board\"",
    "  (parser (string_quote \\\") (host_cad Tyton))",
    "  (resolution mm 2540)",
    "  (structure",
    "    (layer F.Cu (type signal))",
    "    (layer B.Cu (type signal))",
    "    (boundary (rect -50 -40 50 40))",
    "    (via \"Via\" (shape (circle F.Cu 0.2)) (shape (circle B.Cu 0.2)))",
    "    (rule (width 0.15) (clearance 0.15))",
    "  )",
    "  (placement"
  ];

  // Simple component placement in grid
  let x = -40, y = -30;
  for (const component of eda.components) {
    lines.push(`    (component "${component.footprint || "Generic"}" (place "${component.ref}" ${x} ${y} front 0))`);
    x += 15;
    if (x > 40) {
      x = -40;
      y += 10;
    }
  }

  lines.push("  )", "  (network");

  // Add nets
  for (const net of netlist.nets) {
    if (net.members.length >= 2) {
      lines.push(`    (net "${net.name}" (pins ${net.members.map(m => `"${m.ref}-${m.pin}"`).join(" ")}))`);
    }
  }

  lines.push("  )", ")");
  return lines.join("\n");
}

/**
 * Validate DSN output
 */
export function validateDsn(dsn: string): {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    nets: number;
    components: number;
    pins: number;
  };
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Basic syntax validation
  const openParens = (dsn.match(/\(/g) || []).length;
  const closeParens = (dsn.match(/\)/g) || []).length;
  
  if (openParens !== closeParens) {
    errors.push("Mismatched parentheses in DSN output");
  }
  
  // Check required sections
  if (!dsn.includes("(structure")) {
    errors.push("Missing structure section");
  }
  if (!dsn.includes("(placement")) {
    errors.push("Missing placement section");  
  }
  if (!dsn.includes("(network")) {
    errors.push("Missing network section");
  }
  
  // Extract statistics
  const netMatches = dsn.match(/\(net\s+"[^"]+"/g) || [];
  const componentMatches = dsn.match(/\(place\s+"[^"]+"/g) || [];
  const pinMatches = dsn.match(/"[A-Z]+\d+-\d+"/g) || [];
  
  const stats = {
    nets: netMatches.length,
    components: componentMatches.length,
    pins: pinMatches.length
  };
  
  if (stats.nets === 0) {
    warnings.push("No nets found in DSN");
  }
  if (stats.components === 0) {
    warnings.push("No components found in DSN");
  }
  
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats
  };
}