import { EdaSpecV1 } from "./spec";
import { SchematicSpec } from "@/server/validation/schematicSpecValidator";

export function groupComponents(eda: EdaSpecV1): Record<string, string[]> {
  console.log('[EDA_PLACEMENT] Grouping components by role');
  
  const groups: Record<string, string[]> = {
    MCU: [],
    Power: [],
    Connectors: [],
    Protection: [],
    Decoupling: [],
    Sensors: [],
    Misc: []
  };
  
  for (const comp of eda.components) {
    const ref = comp.ref;
    const role = comp.role || "";
    const value = comp.value || "";
    const mpn = comp.mpn || "";
    const refPrefix = ref.charAt(0).toUpperCase();
    
    // Classify components by role and heuristics
    if (role === "MCU" || role.includes("MCU") || 
        mpn.includes("ESP32") || mpn.includes("STM32") || 
        comp.attributes?.description?.toLowerCase().includes("microcontroller")) {
      groups.MCU.push(ref);
    } else if (role === "Connector" || role.includes("Connector") || 
               refPrefix === "J" || refPrefix === "P") {
      groups.Connectors.push(ref);
    } else if (role === "Power" || role === "Protection" || 
               refPrefix === "U" && (value.includes("LDO") || value.includes("REG") || 
               comp.attributes?.description?.toLowerCase().includes("regulator"))) {
      groups.Power.push(ref);
    } else if (role === "Protection" || 
               refPrefix === "D" && (value.includes("TVS") || value.includes("ESD")) ||
               refPrefix === "F") {
      groups.Protection.push(ref);
    } else if (role === "Decoupling" || 
               (refPrefix === "C" && (value.includes("100nF") || value.includes("0.1uF") || 
                value.includes("10uF") || value.includes("22uF")))) {
      groups.Decoupling.push(ref);
    } else if (role === "Sensor" || role.includes("Sensor") ||
               comp.attributes?.description?.toLowerCase().includes("sensor") ||
               comp.attributes?.description?.toLowerCase().includes("imu") ||
               comp.attributes?.description?.toLowerCase().includes("gyro") ||
               comp.attributes?.description?.toLowerCase().includes("accel")) {
      groups.Sensors.push(ref);
    } else {
      groups.Misc.push(ref);
    }
  }
  
  console.log('[EDA_PLACEMENT] Component grouping:', Object.entries(groups).map(([k, v]) => `${k}: ${v.length}`).join(', '));
  return groups;
}

export function seedPlacement(eda: EdaSpecV1): EdaSpecV1 {
  console.log('[EDA_PLACEMENT] Computing optimized component placement');
  
  const groups = groupComponents(eda);
  const boardWidth = eda.board.outline_mm.width;
  const boardHeight = eda.board.outline_mm.height;
  const margin = 5; // mm from board edge
  
  const newPlacement: any[] = [];
  
  // Define component sizes (rough estimates for placement)
  const getComponentSize = (ref: string, role?: string) => {
    const prefix = ref.charAt(0).toUpperCase();
    
    if (role === "MCU" || groups.MCU.includes(ref)) return { w: 20, h: 20 };
    if (role === "Connector" || groups.Connectors.includes(ref)) return { w: 15, h: 8 };
    if (prefix === "U") return { w: 12, h: 8 }; // Generic IC
    if (prefix === "C" || prefix === "R") return { w: 4, h: 2 }; // 0603/0805 passives
    if (prefix === "L") return { w: 6, h: 6 }; // Inductors
    return { w: 6, h: 6 }; // Default
  };
  
  // 1. Place connectors along top edge
  let connectorX = margin;
  for (const ref of groups.Connectors) {
    const size = getComponentSize(ref, "Connector");
    newPlacement.push({
      ref,
      x_mm: Math.min(connectorX, boardWidth - margin - size.w),
      y_mm: margin,
      rot_deg: 0,
      group: "Connectors"
    });
    connectorX += size.w + 5;
  }
  
  // 2. Place MCU at center
  for (const ref of groups.MCU) {
    const size = getComponentSize(ref, "MCU");
    newPlacement.push({
      ref,
      x_mm: boardWidth / 2 - size.w / 2,
      y_mm: boardHeight / 2 - size.h / 2,
      rot_deg: 0,
      group: "MCU"
    });
  }
  
  // 3. Place power components near connectors (left area)
  let powerY = 15;
  for (const ref of groups.Power) {
    const size = getComponentSize(ref, "Power");
    newPlacement.push({
      ref,
      x_mm: margin,
      y_mm: Math.min(powerY, boardHeight - margin - size.h),
      rot_deg: 0,
      group: "Power"
    });
    powerY += size.h + 3;
  }
  
  // 4. Place protection near power
  let protectionY = powerY + 5;
  for (const ref of groups.Protection) {
    const size = getComponentSize(ref, "Protection");
    newPlacement.push({
      ref,
      x_mm: margin + 8,
      y_mm: Math.min(protectionY, boardHeight - margin - size.h),
      rot_deg: 0,
      group: "Protection"
    });
    protectionY += size.h + 2;
  }
  
  // 5. Place decoupling capacitors near MCU (within 10mm)
  const mcuPosition = newPlacement.find(p => groups.MCU.includes(p.ref));
  const mcuX = mcuPosition?.x_mm || boardWidth / 2;
  const mcuY = mcuPosition?.y_mm || boardHeight / 2;
  
  let decouplingAngle = 0;
  const decouplingRadius = 8; // mm from MCU
  
  for (const ref of groups.Decoupling) {
    const angle = (decouplingAngle * Math.PI * 2) / Math.max(1, groups.Decoupling.length);
    const x = mcuX + Math.cos(angle) * decouplingRadius;
    const y = mcuY + Math.sin(angle) * decouplingRadius;
    
    newPlacement.push({
      ref,
      x_mm: Math.max(margin, Math.min(x, boardWidth - margin - 4)),
      y_mm: Math.max(margin, Math.min(y, boardHeight - margin - 2)),
      rot_deg: 0,
      group: "Decoupling"
    });
    decouplingAngle++;
  }
  
  // 6. Place sensors in right area
  let sensorX = boardWidth - margin - 10;
  let sensorY = 15;
  
  for (const ref of groups.Sensors) {
    const size = getComponentSize(ref, "Sensor");
    newPlacement.push({
      ref,
      x_mm: sensorX,
      y_mm: Math.min(sensorY, boardHeight - margin - size.h),
      rot_deg: 0,
      group: "Sensors"
    });
    sensorY += size.h + 5;
  }
  
  // 7. Place remaining components in a grid
  let gridX = 25, gridY = 25;
  const gridSpacing = 8;
  
  for (const ref of groups.Misc) {
    // Check for overlaps with existing placements
    let placed = false;
    let attempts = 0;
    
    while (!placed && attempts < 20) {
      const overlaps = newPlacement.some(p => {
        const dx = Math.abs(p.x_mm - gridX);
        const dy = Math.abs(p.y_mm - gridY);
        return dx < 6 && dy < 4; // Minimum spacing
      });
      
      if (!overlaps && gridX < boardWidth - margin - 6 && gridY < boardHeight - margin - 4) {
        newPlacement.push({
          ref,
          x_mm: gridX,
          y_mm: gridY,
          rot_deg: 0,
          group: "Misc"
        });
        placed = true;
      }
      
      // Move to next grid position
      gridX += gridSpacing;
      if (gridX > boardWidth - margin - 10) {
        gridX = 25;
        gridY += gridSpacing;
      }
      attempts++;
    }
    
    // Fallback if no good position found
    if (!placed) {
      newPlacement.push({
        ref,
        x_mm: Math.min(gridX, boardWidth - margin - 6),
        y_mm: Math.min(gridY, boardHeight - margin - 4),
        rot_deg: 0,
        group: "Misc"
      });
    }
  }
  
  // Final overlap resolution pass
  resolveOverlaps(newPlacement, boardWidth, boardHeight, margin);
  
  const updatedEda = { ...eda };
  updatedEda.placement = newPlacement;
  
  console.log(`[EDA_PLACEMENT] Placement completed: ${newPlacement.length} components positioned`);
  return updatedEda;
}

function resolveOverlaps(placements: any[], boardWidth: number, boardHeight: number, margin: number) {
  console.log('[EDA_PLACEMENT] Resolving placement overlaps');
  
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const p1 = placements[i];
      const p2 = placements[j];
      
      const dx = Math.abs(p1.x_mm - p2.x_mm);
      const dy = Math.abs(p1.y_mm - p2.y_mm);
      
      // Check for overlap (minimum 4mm x 3mm spacing)
      if (dx < 4 && dy < 3) {
        // Move the second component
        let newX = p2.x_mm + (p1.x_mm < p2.x_mm ? 5 : -5);
        let newY = p2.y_mm + (p1.y_mm < p2.y_mm ? 4 : -4);
        
        // Keep within board bounds
        newX = Math.max(margin, Math.min(newX, boardWidth - margin - 6));
        newY = Math.max(margin, Math.min(newY, boardHeight - margin - 4));
        
        p2.x_mm = newX;
        p2.y_mm = newY;
      }
    }
  }
}