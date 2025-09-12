import { SchematicSpec } from "@/server/validation/schematicSpecValidator";
import { EdaSpecV1 } from "./spec";

export function seedEdaFromSchematic(specV12: SchematicSpec): EdaSpecV1 {
  console.log('[EDA_MAPPER] Converting schematicSpec v1.2 to edaSpec v1.0');
  
  // Build components array from all component sources
  const edaComponents = [];
  
  // Add main components
  for (const comp of specV12.components || []) {
    edaComponents.push({
      ref: comp.refDes,
      mpn: comp.mpn,
      value: comp.value,
      role: inferComponentRole(comp),
      // Leave symbol/footprint for LLM enrichment
      symbol: undefined,
      footprint: undefined,
      orientation_deg: 0,
      attributes: { description: comp.description, package: comp.package }
    });
  }
  
  // Add connectors
  for (const conn of specV12.connectors || []) {
    edaComponents.push({
      ref: conn.refDes,
      mpn: undefined,
      value: `${conn.pins}P`,
      role: "Connector",
      symbol: undefined,
      footprint: undefined,
      orientation_deg: 0,
      attributes: { type: conn.type, pins: conn.pins, description: conn.description }
    });
  }
  
  // Add protections
  for (const prot of specV12.protections || []) {
    edaComponents.push({
      ref: prot.refDes,
      mpn: undefined,
      value: prot.rating,
      role: "Protection",
      symbol: undefined,
      footprint: undefined,
      orientation_deg: 0,
      attributes: { type: prot.type, rationale: prot.rationale }
    });
  }
  
  // Add decoupling capacitors
  for (const dec of specV12.decoupling || []) {
    edaComponents.push({
      ref: dec.refDes,
      mpn: undefined,
      value: dec.value,
      role: "Decoupling",
      symbol: undefined,
      footprint: undefined,
      orientation_deg: 0,
      attributes: { type: dec.type, voltage: dec.voltage, placement: dec.placement }
    });
  }
  
  // Add test points
  for (const tp of specV12.testPoints || []) {
    edaComponents.push({
      ref: tp.refDes,
      mpn: undefined,
      value: "TP",
      role: "TestPoint",
      symbol: undefined,
      footprint: undefined,
      orientation_deg: 0,
      attributes: { net: tp.net, description: tp.description }
    });
  }
  
  // Build net classes with policy rules
  const netClasses = [];
  const processedNets = new Set<string>();
  
  // Process nets to determine classes
  for (const net of specV12.nets || []) {
    const netName = net.name;
    if (processedNets.has(netName)) continue;
    processedNets.add(netName);
    
    let trackWidth = 0.25; // Default SIGNAL
    let clearance = 0.127;
    let className = "SIGNAL";
    
    // Apply policy rules
    if (net.class === 'power' || netName.includes('VCC') || netName.includes('VDD') || netName.includes('GND')) {
      const currentMax = net.props?.current_max_A || 0;
      if (currentMax > 1) {
        trackWidth = 1.0;
        className = "POWER_HIGH";
      } else {
        trackWidth = 0.5;
        className = "POWER";
      }
      clearance = 0.2;
    } else if (netName.includes('USB_D') || netName.includes('USB_P') || netName.includes('USB_N')) {
      trackWidth = 0.2;
      className = "USB";
      clearance = 0.127;
    } else if (netName.includes('MOTOR') || (net.props?.current_max_A && net.props.current_max_A >= 2)) {
      trackWidth = 1.5;
      className = "MOTOR";
      clearance = 0.3;
    }
    
    // Avoid duplicate net classes
    if (!netClasses.find(nc => nc.name === className)) {
      netClasses.push({
        name: className,
        track_mm: trackWidth,
        clearance_mm: clearance,
        via_diam_mm: Math.max(0.6, trackWidth + 0.2),
        via_drill_mm: Math.max(0.3, trackWidth * 0.5)
      });
    }
  }
  
  // Add default classes if not present
  if (!netClasses.find(nc => nc.name === "SIGNAL")) {
    netClasses.push({ name: "SIGNAL", track_mm: 0.25, clearance_mm: 0.127, via_diam_mm: 0.6, via_drill_mm: 0.3 });
  }
  if (!netClasses.find(nc => nc.name === "POWER")) {
    netClasses.push({ name: "POWER", track_mm: 0.5, clearance_mm: 0.2, via_diam_mm: 0.8, via_drill_mm: 0.4 });
  }
  
  // Build diff pairs for USB
  const diffPairs = [];
  const usbNets = (specV12.nets || []).filter(n => 
    n.name.includes('USB_DP') || n.name.includes('USB_DN') || 
    n.name.includes('USB_D+') || n.name.includes('USB_D-')
  );
  
  if (usbNets.length >= 2) {
    const dpNet = usbNets.find(n => n.name.includes('P') || n.name.includes('+'));
    const dnNet = usbNets.find(n => n.name.includes('N') || n.name.includes('-'));
    if (dpNet && dnNet) {
      diffPairs.push({
        pos: dpNet.name,
        neg: dnNet.name,
        class: "USB",
        match_tol_mm: 0.25
      });
    }
  }
  
  // Create board outline (default 100x80mm)
  const boardWidth = 100;
  const boardHeight = 80;
  
  // Seed placement with basic grid layout
  const placement = [];
  const componentsPerRow = Math.ceil(Math.sqrt(edaComponents.length));
  const spacingX = Math.max(10, (boardWidth - 20) / componentsPerRow);
  const spacingY = Math.max(8, (boardHeight - 16) / Math.ceil(edaComponents.length / componentsPerRow));
  
  let x = 10, y = 10, col = 0;
  
  for (const comp of edaComponents) {
    let targetX = x, targetY = y;
    
    // Apply placement rules
    if (comp.role === "Connector") {
      // Connectors at edges
      targetY = 5; // Top edge
      targetX = 10 + (placement.filter(p => p.group === "Connectors").length * 20);
    } else if (comp.role === "MCU" || comp.attributes?.description?.toLowerCase().includes('mcu')) {
      // MCU at center
      targetX = boardWidth / 2;
      targetY = boardHeight / 2;
    } else if (comp.role === "Power" || comp.role === "Protection") {
      // Power/protection near connectors (left area)
      targetX = 15;
      targetY = 20 + (placement.filter(p => p.group === "Power").length * 10);
    } else if (comp.role === "Decoupling") {
      // Decoupling near MCU (will be refined by LLM)
      targetX = boardWidth / 2 + 10;
      targetY = boardHeight / 2 + 10;
    } else {
      // Regular grid for others
      targetX = x;
      targetY = y;
      col++;
      if (col >= componentsPerRow) {
        col = 0;
        x = 10;
        y += spacingY;
      } else {
        x += spacingX;
      }
    }
    
    placement.push({
      ref: comp.ref,
      x_mm: Math.min(Math.max(targetX, 5), boardWidth - 5),
      y_mm: Math.min(Math.max(targetY, 5), boardHeight - 5),
      rot_deg: 0,
      group: getPlacementGroup(comp.role || "Misc")
    });
  }
  
  // Add antenna keepouts for RF components
  const antennaKeepouts = [];
  for (const comp of edaComponents) {
    if (comp.role?.includes('RF') || comp.mpn?.includes('ESP32') || comp.mpn?.includes('nRF')) {
      antennaKeepouts.push({
        ref: comp.ref,
        radius_mm: 15
      });
    }
  }
  
  // Collect open questions
  const openQuestions = [...(specV12.openQuestions || [])];
  const undefinedFootprints = edaComponents.filter(c => !c.footprint).length;
  const undefinedSymbols = edaComponents.filter(c => !c.symbol).length;
  
  if (undefinedFootprints > 0) {
    openQuestions.push(`${undefinedFootprints} components need footprint assignment`);
  }
  if (undefinedSymbols > 0) {
    openQuestions.push(`${undefinedSymbols} components need symbol assignment`);
  }
  
  // Build the EDA spec
  const edaSpec: EdaSpecV1 = {
    version: "1.0",
    target: { tool: "kicad", version: "8" },
    schematicRef: "v1.2",
    components: edaComponents,
    netClasses,
    diffPairs: diffPairs.length > 0 ? diffPairs : undefined,
    board: {
      outline_mm: { width: boardWidth, height: boardHeight, corner_radius: 3 },
      layers: 2,
      stackup: "std-2L",
      keepouts: [],
      zones: [
        { net: "GND", layer: "F.Cu", clearance_mm: 0.2 },
        { net: "GND", layer: "B.Cu", clearance_mm: 0.2 }
      ]
    },
    placement,
    constraints: {
      high_current_nets: (specV12.nets || [])
        .filter(n => n.props?.current_max_A && n.props.current_max_A > 1)
        .map(n => ({ net: n.name, min_track_mm: n.props.current_max_A > 2 ? 1.5 : 1.0 })),
      antenna_keepouts: antennaKeepouts.length > 0 ? antennaKeepouts : undefined,
      analog_islands: (specV12.nets || [])
        .filter(n => n.class === 'analog')
        .map(n => n.name)
    },
    manufacturing: {
      fab: "JLCPCB",
      thickness_mm: 1.6,
      min_track_mm: 0.127,
      min_clearance_mm: 0.127,
      finish: "HASL"
    },
    bomOverrides: [],
    openQuestions
  };
  
  console.log(`[EDA_MAPPER] Generated EDA spec with ${edaComponents.length} components, ${netClasses.length} net classes`);
  return edaSpec;
}

function inferComponentRole(comp: any): string {
  const desc = (comp.description || '').toLowerCase();
  const mpn = (comp.mpn || '').toLowerCase();
  const refDes = (comp.refDes || '').toLowerCase();
  
  if (desc.includes('mcu') || desc.includes('microcontroller') || mpn.includes('esp32') || mpn.includes('stm32')) {
    return "MCU";
  }
  if (refDes.startsWith('r') && (desc.includes('resistor') || comp.value?.includes('ohm') || comp.value?.match(/^\d+k?$/))) {
    return "Resistor";
  }
  if (refDes.startsWith('c') && (desc.includes('capacitor') || comp.value?.includes('f') || comp.value?.includes('F'))) {
    return "Capacitor";
  }
  if (refDes.startsWith('l') && (desc.includes('inductor') || comp.value?.includes('h') || comp.value?.includes('H'))) {
    return "Inductor";
  }
  if (refDes.startsWith('d') && desc.includes('diode')) {
    return "Diode";
  }
  if (refDes.startsWith('u') && !desc.includes('mcu')) {
    return "IC";
  }
  if (desc.includes('sensor') || desc.includes('imu') || desc.includes('temperature') || desc.includes('pressure')) {
    return "Sensor";
  }
  if (desc.includes('regulator') || desc.includes('ldo') || desc.includes('converter')) {
    return "Power";
  }
  return "Misc";
}

function getPlacementGroup(role: string): string {
  switch (role) {
    case "MCU": return "MCU";
    case "Power": case "Protection": return "Power";
    case "Connector": return "Connectors";
    case "Decoupling": return "Decoupling";
    case "Sensor": return "Sensors";
    default: return "Misc";
  }
}