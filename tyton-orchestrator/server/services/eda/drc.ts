import { EdaSpecV1 } from "./spec";
import { SchematicSpec } from "@/server/validation/schematicSpecValidator";

interface DrcResult {
  errors: string[];
  warnings: string[];
}

export function runEdaDrc(eda: EdaSpecV1, schematic: SchematicSpec): DrcResult {
  console.log('[EDA_DRC] Running design rule checks');
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // DRC Error Checks (blocking issues)
  
  // 1. Missing footprints for critical components
  const criticalComponents = eda.components.filter(c => 
    c.role === "MCU" || c.role === "Connector" || 
    c.ref.startsWith('J') || c.ref.startsWith('U')
  );
  
  const missingFootprints = criticalComponents.filter(c => 
    !c.footprint || c.footprint === "TBD" || c.footprint === ""
  );
  
  if (missingFootprints.length > 0) {
    errors.push(`Missing footprints for critical components: ${missingFootprints.map(c => c.ref).join(', ')}`);
  }
  
  // 2. High-current nets without adequate net class
  const highCurrentNets = schematic.nets?.filter(net => 
    net.props?.current_max_A && net.props.current_max_A > 1
  ) || [];
  
  for (const net of highCurrentNets) {
    const powerClass = eda.netClasses.find(nc => 
      nc.name.includes("POWER") && nc.track_mm >= 1.0
    );
    
    if (!powerClass) {
      errors.push(`High-current net "${net.name}" (${net.props.current_max_A}A) has no adequate POWER net class (≥1.0mm)`);
    }
  }
  
  // 3. Keepout/placement overlaps
  const keepoutOverlaps = checkKeepoutOverlaps(eda);
  if (keepoutOverlaps.length > 0) {
    errors.push(...keepoutOverlaps);
  }
  
  // 4. Components outside board outline
  const outsideBoard = eda.placement.filter(p => 
    p.x_mm < 0 || p.y_mm < 0 || 
    p.x_mm > eda.board.outline_mm.width || 
    p.y_mm > eda.board.outline_mm.height
  );
  
  if (outsideBoard.length > 0) {
    errors.push(`Components placed outside board outline: ${outsideBoard.map(p => p.ref).join(', ')}`);
  }
  
  // DRC Warning Checks (non-blocking issues)
  
  // 1. RF modules without antenna keepouts
  const rfComponents = eda.components.filter(c =>
    c.role?.includes('RF') || 
    c.mpn?.includes('ESP32') || 
    c.mpn?.includes('nRF') ||
    c.mpn?.includes('WiFi') ||
    c.attributes?.description?.toLowerCase().includes('wireless')
  );
  
  const hasAntennaKeepouts = eda.constraints?.antenna_keepouts && eda.constraints.antenna_keepouts.length > 0;
  
  if (rfComponents.length > 0 && !hasAntennaKeepouts) {
    warnings.push(`RF modules present (${rfComponents.map(c => c.ref).join(', ')}) but no antenna keepouts defined`);
  }
  
  // 2. Decoupling capacitors far from target ICs
  const decouplingCaps = eda.components.filter(c => c.role === "Decoupling" || 
    (c.ref.startsWith('C') && (c.value?.includes('100nF') || c.value?.includes('0.1uF')))
  );
  
  const mcuComponents = eda.components.filter(c => c.role === "MCU");
  
  for (const cap of decouplingCaps) {
    const capPos = eda.placement.find(p => p.ref === cap.ref);
    if (!capPos) continue;
    
    let closestIcDistance = Infinity;
    
    for (const mcu of mcuComponents) {
      const mcuPos = eda.placement.find(p => p.ref === mcu.ref);
      if (!mcuPos) continue;
      
      const distance = Math.sqrt(
        Math.pow(capPos.x_mm - mcuPos.x_mm, 2) + 
        Math.pow(capPos.y_mm - mcuPos.y_mm, 2)
      );
      
      closestIcDistance = Math.min(closestIcDistance, distance);
    }
    
    if (closestIcDistance > 15) {
      warnings.push(`Decoupling capacitor ${cap.ref} is ${closestIcDistance.toFixed(1)}mm from nearest IC (recommend <10mm)`);
    }
  }
  
  // 3. USB differential pairs without proper definition
  const usbNets = schematic.nets?.filter(net =>
    net.name.includes('USB_D') || net.name.includes('USB_P') || net.name.includes('USB_N')
  ) || [];
  
  const hasDiffPairs = eda.diffPairs && eda.diffPairs.length > 0;
  
  if (usbNets.length >= 2 && !hasDiffPairs) {
    warnings.push(`USB differential signals detected but no differential pairs defined in EDA spec`);
  }
  
  // 4. High-power components clustering
  const powerComponents = eda.components.filter(c => 
    c.role === "Power" || c.attributes?.description?.toLowerCase().includes('regulator')
  );
  
  if (powerComponents.length > 1) {
    const powerPositions = powerComponents.map(comp => {
      const pos = eda.placement.find(p => p.ref === comp.ref);
      return { ref: comp.ref, pos };
    }).filter(item => item.pos);
    
    for (let i = 0; i < powerPositions.length; i++) {
      for (let j = i + 1; j < powerPositions.length; j++) {
        const p1 = powerPositions[i].pos!;
        const p2 = powerPositions[j].pos!;
        
        const distance = Math.sqrt(
          Math.pow(p1.x_mm - p2.x_mm, 2) + 
          Math.pow(p1.y_mm - p2.y_mm, 2)
        );
        
        if (distance < 10) {
          warnings.push(`Power components ${powerPositions[i].ref} and ${powerPositions[j].ref} are too close (${distance.toFixed(1)}mm) - thermal concerns`);
        }
      }
    }
  }
  
  // 5. Missing symbols
  const missingSymbols = eda.components.filter(c => !c.symbol || c.symbol === "TBD");
  if (missingSymbols.length > 0) {
    warnings.push(`${missingSymbols.length} components missing symbol assignment: ${missingSymbols.slice(0, 5).map(c => c.ref).join(', ')}${missingSymbols.length > 5 ? '...' : ''}`);
  }
  
  // 6. Generic net class usage
  const signalOnlyDesign = eda.netClasses.length === 1 && eda.netClasses[0].name === "SIGNAL";
  if (signalOnlyDesign && schematic.nets && schematic.nets.length > 3) {
    warnings.push("Design uses only generic SIGNAL net class - consider adding POWER, USB, or other specialized classes");
  }
  
  // 7. No ground zones
  const hasGroundZones = eda.board.zones?.some(z => z.net === "GND" || z.net.includes("GND"));
  if (!hasGroundZones) {
    warnings.push("No ground zones defined - consider adding GND zones for better EMI performance");
  }
  
  // 8. Board size concerns
  const boardArea = eda.board.outline_mm.width * eda.board.outline_mm.height;
  const componentDensity = eda.components.length / (boardArea / 100); // components per cm²
  
  if (componentDensity > 5) {
    warnings.push(`High component density (${componentDensity.toFixed(1)} components/cm²) - consider larger board or fewer components`);
  }
  
  if (eda.board.outline_mm.width < 20 || eda.board.outline_mm.height < 20) {
    warnings.push("Very small board dimensions - verify manufacturability and assembly constraints");
  }
  
  console.log(`[EDA_DRC] DRC completed: ${errors.length} errors, ${warnings.length} warnings`);
  return { errors, warnings };
}

function checkKeepoutOverlaps(eda: EdaSpecV1): string[] {
  const overlaps: string[] = [];
  
  if (!eda.constraints?.antenna_keepouts) return overlaps;
  
  for (const keepout of eda.constraints.antenna_keepouts) {
    const keepoutPos = eda.placement.find(p => p.ref === keepout.ref);
    if (!keepoutPos) continue;
    
    // Check overlap with other components
    const overlappingComponents = eda.placement.filter(p => {
      if (p.ref === keepout.ref) return false;
      
      const distance = Math.sqrt(
        Math.pow(p.x_mm - keepoutPos.x_mm, 2) + 
        Math.pow(p.y_mm - keepoutPos.y_mm, 2)
      );
      
      return distance < keepout.radius_mm;
    });
    
    if (overlappingComponents.length > 0) {
      overlaps.push(
        `Antenna keepout around ${keepout.ref} (${keepout.radius_mm}mm radius) overlaps with: ${overlappingComponents.map(c => c.ref).join(', ')}`
      );
    }
    
    // Check keepout extends beyond board edge
    const boardWidth = eda.board.outline_mm.width;
    const boardHeight = eda.board.outline_mm.height;
    
    if (keepoutPos.x_mm - keepout.radius_mm < 0 || 
        keepoutPos.x_mm + keepout.radius_mm > boardWidth ||
        keepoutPos.y_mm - keepout.radius_mm < 0 || 
        keepoutPos.y_mm + keepout.radius_mm > boardHeight) {
      overlaps.push(`Antenna keepout around ${keepout.ref} extends beyond board outline`);
    }
  }
  
  return overlaps;
}

// Additional DRC utilities

export function validateNetClassConsistency(eda: EdaSpecV1, schematic: SchematicSpec): string[] {
  const issues: string[] = [];
  
  // Check that all power nets have appropriate net classes
  const powerNets = schematic.nets?.filter(net => 
    net.class === 'power' || 
    net.name.includes('VCC') || 
    net.name.includes('VDD') || 
    net.name.includes('GND')
  ) || [];
  
  const powerNetClass = eda.netClasses.find(nc => nc.name.includes("POWER"));
  
  if (powerNets.length > 0 && !powerNetClass) {
    issues.push("Power nets detected but no POWER net class defined");
  }
  
  // Check differential pair consistency
  if (eda.diffPairs) {
    for (const pair of eda.diffPairs) {
      const posNet = schematic.nets?.find(n => n.name === pair.pos);
      const negNet = schematic.nets?.find(n => n.name === pair.neg);
      
      if (!posNet || !negNet) {
        issues.push(`Differential pair ${pair.pos}/${pair.neg} references non-existent nets`);
      }
    }
  }
  
  return issues;
}

export function checkManufacturingConstraints(eda: EdaSpecV1): string[] {
  const issues: string[] = [];
  
  if (!eda.manufacturing) {
    issues.push("No manufacturing constraints specified");
    return issues;
  }
  
  const mfg = eda.manufacturing;
  
  // Check minimum track width consistency
  const minTrackFromClasses = Math.min(...eda.netClasses.map(nc => nc.track_mm));
  
  if (mfg.min_track_mm && minTrackFromClasses < mfg.min_track_mm) {
    issues.push(`Net class minimum track (${minTrackFromClasses}mm) is smaller than manufacturing minimum (${mfg.min_track_mm}mm)`);
  }
  
  // Check clearance consistency
  const minClearanceFromClasses = Math.min(...eda.netClasses.map(nc => nc.clearance_mm));
  
  if (mfg.min_clearance_mm && minClearanceFromClasses < mfg.min_clearance_mm) {
    issues.push(`Net class minimum clearance (${minClearanceFromClasses}mm) is smaller than manufacturing minimum (${mfg.min_clearance_mm}mm)`);
  }
  
  // Board size vs layer count
  const boardArea = eda.board.outline_mm.width * eda.board.outline_mm.height;
  
  if (eda.board.layers === 2 && boardArea > 10000) { // 100x100mm
    issues.push("Large board (>100x100mm) with only 2 layers - consider 4-layer stack for better routing");
  }
  
  return issues;
}