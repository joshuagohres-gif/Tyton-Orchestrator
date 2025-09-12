import { EdaSpecV1 } from "./spec";
import { SchematicSpec } from "@/server/validation/schematicSpecValidator";

export function makeDsnText(
  projectTitle: string, 
  schematic: SchematicSpec, 
  eda: EdaSpecV1
): string {
  console.log(`[DSN_EXPORT] Generating DSN file for "${projectTitle}"`);
  
  const safeTitle = projectTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  let dsn = `(pcb ${safeTitle}\\n`;
  dsn += `  (parser\\n`;
  dsn += `    (string_quote ")\\n`;
  dsn += `    (space_in_quoted_tokens on)\\n`;
  dsn += `    (host_cad "Tyton EDA")\\n`;
  dsn += `    (host_version "1.0")\\n`;
  dsn += `  )\\n`;
  dsn += `  (resolution um 10)\\n`;
  dsn += `  (unit um)\\n\\n`;
  
  // Structure
  dsn += `  (structure\\n`;
  
  // Layer stack
  dsn += `    (layer_stack\\n`;
  if (eda.board.layers === 2) {
    dsn += `      (layer "F.Cu" (type signal) (property (index 0)))\\n`;
    dsn += `      (layer "B.Cu" (type signal) (property (index 1)))\\n`;
  } else {
    dsn += `      (layer "F.Cu" (type signal) (property (index 0)))\\n`;
    dsn += `      (layer "In1.Cu" (type signal) (property (index 1)))\\n`;
    dsn += `      (layer "In2.Cu" (type signal) (property (index 2)))\\n`;
    dsn += `      (layer "B.Cu" (type signal) (property (index 3)))\\n`;
  }
  dsn += `    )\\n\\n`;
  
  // Board boundary
  const width = eda.board.outline_mm.width * 1000; // Convert to micrometers
  const height = eda.board.outline_mm.height * 1000;
  
  dsn += `    (boundary\\n`;
  dsn += `      (path signal 150\\n`; // 0.15mm line width
  dsn += `        0 0\\n`;
  dsn += `        ${width} 0\\n`;
  dsn += `        ${width} ${height}\\n`;
  dsn += `        0 ${height}\\n`;
  dsn += `        0 0\\n`;
  dsn += `      )\\n`;
  dsn += `    )\\n\\n`;
  
  // Via definitions
  dsn += `    (via\\n`;
  for (const nc of eda.netClasses) {
    const viaDia = (nc.via_diam_mm || 0.8) * 1000;
    const viaDrill = (nc.via_drill_mm || 0.4) * 1000;
    dsn += `      "${nc.name}_via" ${viaDia} ${viaDrill}\\n`;
  }
  dsn += `    )\\n\\n`;
  
  // Rules
  dsn += `    (rule\\n`;
  dsn += `      (width ${(eda.manufacturing?.min_track_mm || 0.127) * 1000})\\n`;
  dsn += `      (clearance ${(eda.manufacturing?.min_clearance_mm || 0.127) * 1000})\\n`;
  
  // Net class rules
  for (const nc of eda.netClasses) {
    const trackWidth = nc.track_mm * 1000;
    const clearance = nc.clearance_mm * 1000;
    dsn += `      (rule (class "${nc.name}")\\n`;
    dsn += `        (width ${trackWidth})\\n`;
    dsn += `        (clearance ${clearance})\\n`;
    dsn += `      )\\n`;
  }
  
  dsn += `    )\\n`;
  
  dsn += `  )\\n\\n`; // Close structure
  
  // Placement section
  dsn += `  (placement\\n`;
  
  // Component definitions and placement
  const uniqueFootprints = [...new Set(eda.components.map(c => c.footprint).filter(f => f && f !== "TBD"))];
  
  // Image (footprint) definitions
  for (const footprint of uniqueFootprints) {
    dsn += `    (image "${footprint}"\\n`;
    
    // For DSN, we need to define the pads. Since we don't have detailed footprint data,
    // we'll create simplified rectangular pads based on common patterns
    const padCount = inferPadCount(footprint);
    const padSize = inferPadSize(footprint);
    
    for (let i = 1; i <= padCount; i++) {
      const padX = ((i - 1) % 2 === 0 ? -500 : 500); // Simple 2-pad layout
      const padY = 0;
      dsn += `      (pin "${i}" ${padX} ${padY})\\n`;
    }
    
    dsn += `    )\\n\\n`;
  }
  
  // Component placement
  for (const placement of eda.placement) {
    const comp = eda.components.find(c => c.ref === placement.ref);
    if (!comp || !comp.footprint || comp.footprint === "TBD") continue;
    
    const x = placement.x_mm * 1000;
    const y = placement.y_mm * 1000;
    const rotation = placement.rot_deg || 0;
    
    dsn += `    (component "${comp.footprint}"\\n`;
    dsn += `      (place "${comp.ref}" ${x} ${y} ${rotation > 0 ? `rotate ${rotation}` : 'front'})\\n`;
    dsn += `    )\\n`;
  }
  
  dsn += `  )\\n\\n`; // Close placement
  
  // Library section (simplified)
  dsn += `  (library\\n`;
  for (const footprint of uniqueFootprints) {
    dsn += `    (image "${footprint}"\\n`;
    const padCount = inferPadCount(footprint);
    for (let i = 1; i <= padCount; i++) {
      dsn += `      (pin "1" 0 0)\\n`; // Simplified pin definition
    }
    dsn += `    )\\n`;
  }
  dsn += `  )\\n\\n`;
  
  // Network section
  dsn += `  (network\\n`;
  
  // Net definitions
  const nets = schematic.nets || [];
  for (const net of nets) {
    dsn += `    (net "${net.name}"\\n`;
    
    // Find net class
    const netClass = findNetClassForNet(net, eda.netClasses);
    if (netClass) {
      dsn += `      (class "${netClass.name}")\\n`;
    }
    
    dsn += `    )\\n`;
  }
  
  // Net classes
  for (const nc of eda.netClasses) {
    dsn += `    (class "${nc.name}"\\n`;
    dsn += `      (circuit\\n`;
    dsn += `        (use_via "${nc.name}_via")\\n`;
    dsn += `      )\\n`;
    dsn += `      (rule\\n`;
    dsn += `        (width ${nc.track_mm * 1000})\\n`;
    dsn += `        (clearance ${nc.clearance_mm * 1000})\\n`;
    dsn += `      )\\n`;
    dsn += `    )\\n`;
  }
  
  dsn += `  )\\n\\n`; // Close network
  
  // Wiring section (empty - to be filled by autorouter)
  dsn += `  (wiring\\n`;
  dsn += `  )\\n\\n`;
  
  dsn += `)\\n`; // Close pcb
  
  console.log(`[DSN_EXPORT] Generated DSN file: ${dsn.length} characters`);
  return dsn;
}

function inferPadCount(footprint: string): number {
  // Simple heuristics to infer pad count from footprint name
  if (footprint.includes('0603') || footprint.includes('0805')) return 2;
  if (footprint.includes('SOT-23')) return 3;
  if (footprint.includes('SOIC-8')) return 8;
  if (footprint.includes('SOIC-14')) return 14;
  if (footprint.includes('SOIC-16')) return 16;
  if (footprint.includes('QFN')) {
    const match = footprint.match(/QFN[_-]?(\\d+)/);
    if (match) return parseInt(match[1]);
    return 20; // Default
  }
  if (footprint.includes('BGA')) return 100; // Simplified
  if (footprint.includes('PinHeader')) {
    const match = footprint.match(/1x(\\d+)/);
    if (match) return parseInt(match[1]);
    return 2;
  }
  
  // Default for unknown footprints
  return 2;
}

function inferPadSize(footprint: string): { width: number; height: number } {
  // Return pad size in micrometers
  if (footprint.includes('0603')) return { width: 800, height: 800 };
  if (footprint.includes('0805')) return { width: 1000, height: 1200 };
  if (footprint.includes('1206')) return { width: 1600, height: 800 };
  if (footprint.includes('SOT-23')) return { width: 600, height: 700 };
  if (footprint.includes('SOIC')) return { width: 600, height: 1500 };
  if (footprint.includes('QFN')) return { width: 300, height: 800 };
  
  // Default
  return { width: 800, height: 800 };
}

function findNetClassForNet(net: any, netClasses: any[]): any | null {
  const netName = net.name.toLowerCase();
  
  // Power nets
  if (net.class === 'power' || netName.includes('vcc') || netName.includes('vdd') || netName.includes('gnd')) {
    return netClasses.find(nc => nc.name.includes('POWER'));
  }
  
  // USB nets
  if (netName.includes('usb')) {
    return netClasses.find(nc => nc.name.includes('USB'));
  }
  
  // Motor nets
  if (netName.includes('motor')) {
    return netClasses.find(nc => nc.name.includes('MOTOR'));
  }
  
  // Default to SIGNAL class
  return netClasses.find(nc => nc.name === 'SIGNAL') || netClasses[0];
}