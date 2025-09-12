// /server/parsers/schematicFromLLM.ts
import { SchematicSpec } from "@/server/validation/schematicSpecValidator";

export interface PinTableRow {
  refDes: string;
  pin: string;
  net?: string;
  dir?: string;
  v?: string;
  notes?: string;
}

export interface PinTable {
  rows: PinTableRow[];
}

/**
 * Extract JSON blocks from raw LLM output
 */
export function extractJsonBlocks(raw: string): string[] {
  const blocks: string[] = [];
  
  // Pattern 1: ```json ... ```
  const jsonFencePattern = /```json\s*([\s\S]*?)\s*```/gi;
  let match;
  while ((match = jsonFencePattern.exec(raw)) !== null) {
    blocks.push(match[1]);
  }
  
  // Pattern 2: { ... } blocks (bare JSON)
  const bareJsonPattern = /\{\s*"version"\s*:\s*"1\.2"[\s\S]*?\}(?=\s*(?:\n\n|$|```|#))/gm;
  while ((match = bareJsonPattern.exec(raw)) !== null) {
    blocks.push(match[0]);
  }
  
  // Pattern 3: Look for any object starting with version field
  const versionPattern = /\{\s*"version"[\s\S]*?\}/gm;
  while ((match = versionPattern.exec(raw)) !== null) {
    blocks.push(match[0]);
  }
  
  // Prefer blocks with explicit version 1.2, then by last occurrence
  const prioritized = blocks
    .map((block, index) => ({ block, index, hasVersion: block.includes('"version": "1.2"') }))
    .sort((a, b) => {
      if (a.hasVersion && !b.hasVersion) return -1;
      if (!a.hasVersion && b.hasVersion) return 1;
      return b.index - a.index; // Most recent first
    });
  
  return prioritized.map(p => p.block);
}

/**
 * Lenient JSON parser with repair attempts
 */
export function lenientParse(jsonLike: string): any {
  // Try native parse first
  try {
    return JSON.parse(jsonLike);
  } catch (e) {
    // Attempt repairs
    let repaired = jsonLike
      // Strip json markers
      .replace(/^[\s]*```?json[\s]*/, '')
      .replace(/[\s]*```?[\s]*$/, '')
      // Remove trailing commas
      .replace(/,(\s*[}\]])/g, '$1')
      // Replace smart quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Collapse illegal newlines in strings
      .replace(/"([^"]*)\n([^"]*)"/g, '"$1 $2"');
    
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      console.warn('Failed to parse JSON after repair:', e2.message);
      return null;
    }
  }
}

/**
 * Extract pin mapping table from raw text
 */
export function extractPinTable(raw: string): PinTable | null {
  // Look for pin mapping table section
  const tablePattern = /pin[-\s]*(?:level\s+)?mapping[^|\n]*\n([^#]*?)(?=\n\n|$|#)/gi;
  const match = tablePattern.exec(raw);
  
  if (!match) return null;
  
  const tableText = match[1];
  const lines = tableText.split('\n').filter(line => line.trim());
  
  const rows: PinTableRow[] = [];
  let currentRefDes = '';
  
  for (const line of lines) {
    if (line.includes('|') && !line.includes('---')) {
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
      
      if (cells.length >= 2) {
        const refDes = cells[0] || currentRefDes;
        if (refDes && refDes !== 'RefDes') {
          currentRefDes = refDes;
          
          rows.push({
            refDes: currentRefDes,
            pin: cells[1] || '',
            net: cells.length > 2 ? cells[2] : undefined,
            dir: cells.length > 3 ? cells[3] : undefined,
            v: cells.length > 4 ? cells[4] : undefined,
            notes: cells.length > 5 ? cells[5] : undefined
          });
        }
      }
    }
  }
  
  return rows.length > 0 ? { rows } : null;
}

/**
 * Normalize alternative JSON format to SchematicSpec v1.2
 */
export function normalizeAltToV12(alt: any, pinTable?: PinTable): SchematicSpec {
  const spec: any = {
    version: "1.2",
    project: {
      title: alt.project?.name || alt.project?.title || "Untitled Circuit",
      units: "metric"
    }
  };
  
  // Handle netClasses conversion from object to array
  if (alt.netClasses && typeof alt.netClasses === 'object') {
    spec.netClasses = Object.entries(alt.netClasses).map(([key, value]: [string, any]) => ({
      name: key.toUpperCase(),
      min_track_mm: value.minWidth || 0.1,
      clearance_mm: value.clearance || 0.1,
      via_size_mm: value.maxVia || 0.3
    }));
  } else {
    spec.netClasses = [
      { name: "POWER", min_track_mm: 0.2, clearance_mm: 0.2, via_size_mm: 0.6 },
      { name: "SIGNAL", min_track_mm: 0.1, clearance_mm: 0.1, via_size_mm: 0.3 }
    ];
  }
  
  // Handle powerTree conversion
  if (alt.powerTree?.rails) {
    spec.powerTree = [];
    
    for (const rail of alt.powerTree.rails) {
      if (rail.source?.includes('J1')) {
        // DC input source
        spec.powerTree.push({
          source: {
            ref: rail.source.split('.')[0] || 'J1',
            type: "DC_IN",
            voltage_V: rail.voltage || 12
          },
          net: rail.name || `+${rail.voltage}V_IN`
        });
      } else if (rail.source?.includes('U_REG')) {
        // Regulator downstream
        spec.powerTree.push({
          regulator: {
            ref: rail.source.split('.')[0] || 'U_REG1',
            topology: rail.regulation?.toLowerCase() || "ldo",
            vin_net: "VIN",
            vout_net: rail.name || "+3V3",
            vout_V: rail.voltage || 3.3
          }
        });
      }
    }
  }
  
  // Handle components conversion
  if (alt.components) {
    spec.components = alt.components.map((comp: any) => {
      const component: any = {
        ref: comp.refDes || comp.ref,
        mpn: comp.mpn || comp.value || "",
        footprint: comp.package || comp.footprint || "UNKNOWN",
        description: comp.description || ""
      };
      
      // Convert pins from object to array
      if (comp.pins && typeof comp.pins === 'object') {
        component.pins = Object.entries(comp.pins).map(([num, pin]: [string, any]) => ({
          num,
          name: pin.name,
          dir: pin.type?.toUpperCase() || "IO",
          net: pin.net || findNetForPin(comp.refDes || comp.ref, num, pinTable)
        }));
      } else if (Array.isArray(comp.pins)) {
        component.pins = comp.pins;
      } else {
        component.pins = [];
      }
      
      return component;
    });
  } else {
    spec.components = [];
  }
  
  // Handle nets conversion
  if (alt.nets) {
    spec.nets = alt.nets.map((net: any) => ({
      name: net.name,
      class: net.class?.toUpperCase() || "SIGNAL",
      members: net.members || [],
      props: net.props || {}
    }));
  } else {
    spec.nets = [];
  }
  
  // Handle buses conversion
  if (alt.buses) {
    spec.buses = alt.buses.map((bus: any) => ({
      name: bus.name,
      type: bus.type,
      nets: bus.nets || [],
      members: bus.devices?.map((dev: any) => ({
        ref: dev.refDes || dev.ref,
        role: dev.role,
        i2c_addr_hex: dev.address !== 'N/A' ? dev.address : undefined
      })) || []
    }));
  } else {
    spec.buses = [];
  }
  
  // Handle connectors conversion
  if (alt.connectors) {
    spec.connectors = alt.connectors.map((conn: any) => {
      const connector: any = {
        ref: conn.refDes || conn.ref,
        type: conn.type || "HEADER",
        description: conn.description || ""
      };
      
      // Convert pinout object to pins array
      if (conn.pinout && typeof conn.pinout === 'object') {
        connector.pins = Object.entries(conn.pinout).map(([num, name]: [string, any]) => ({
          num,
          name: typeof name === 'string' ? name : name.toString(),
          net: findNetForPin(connector.ref, num, pinTable)
        }));
      } else if (Array.isArray(conn.pins)) {
        connector.pins = conn.pins;
      } else {
        connector.pins = [];
      }
      
      return connector;
    });
  } else {
    spec.connectors = [];
  }
  
  // Copy other fields with minimal changes
  spec.protections = alt.protections || [];
  spec.decoupling = alt.decoupling || [];
  spec.testPoints = alt.testPoints || [];
  spec.mechanical = alt.mechanical || [];
  spec.layoutHints = alt.layoutHints || {};
  spec.assumptions = alt.assumptions || [];
  spec.openQuestions = alt.openQuestions || [];
  
  // Handle ERC - flatten multiline details
  if (alt.erc) {
    spec.erc = alt.erc.map((item: any) => ({
      ...item,
      details: typeof item.details === 'string' 
        ? item.details.replace(/\n/g, ' ').trim()
        : item.details
    }));
  } else {
    spec.erc = [];
  }
  
  // Add missing I2C nets if buses reference them
  for (const bus of spec.buses) {
    if (bus.type === 'I2C') {
      for (const netName of bus.nets) {
        if (!spec.nets.find((n: any) => n.name === netName)) {
          spec.nets.push({
            name: netName,
            class: "SIGNAL",
            members: [], // Will be filled from pin table or left as ERC warning
            props: { pullup: "4K7", voltage: 3.3 }
          });
          
          spec.erc.push({
            type: "warning",
            issue: "missing_net_members",
            details: `${netName} referenced by bus but has no connected pins`,
            severity: "medium"
          });
        }
      }
    }
  }
  
  return spec as SchematicSpec;
}

/**
 * Helper to find net name for a pin from pin table
 */
function findNetForPin(refDes: string, pinNum: string, pinTable?: PinTable): string | undefined {
  if (!pinTable) return undefined;
  
  const row = pinTable.rows.find(r => 
    r.refDes === refDes && 
    (r.pin === pinNum || r.pin.includes(pinNum))
  );
  
  return row?.net;
}

/**
 * Main ingestion function
 */
export function ingestSchematic(raw: string): { spec: SchematicSpec; warnings: string[] } {
  const warnings: string[] = [];
  
  // Extract and parse JSON blocks
  const jsonBlocks = extractJsonBlocks(raw);
  let parsedSpec: any = null;
  
  for (const block of jsonBlocks) {
    parsedSpec = lenientParse(block);
    if (parsedSpec) break;
  }
  
  if (!parsedSpec) {
    warnings.push("No valid JSON found in LLM output, using minimal spec from pin table only");
    
    const pinTable = extractPinTable(raw);
    parsedSpec = {
      version: "1.2",
      project: { name: "Generated from Pin Table" },
      components: [],
      nets: [],
      buses: []
    };
    
    if (pinTable) {
      // Create minimal spec from pin table
      const refDesSet = new Set(pinTable.rows.map(r => r.refDes));
      parsedSpec.components = Array.from(refDesSet).map(refDes => ({
        refDes,
        mpn: "UNKNOWN",
        package: "UNKNOWN",
        description: "Generated from pin table",
        pins: pinTable.rows
          .filter(r => r.refDes === refDes)
          .map(r => ({ [r.pin]: { name: r.pin, type: r.dir || "io", net: r.net } }))
          .reduce((acc, pin) => ({ ...acc, ...pin }), {})
      }));
    }
  }
  
  // Check if already v1.2 compliant
  const isV12 = parsedSpec.version === "1.2" && 
    Array.isArray(parsedSpec.components) && 
    Array.isArray(parsedSpec.nets);
  
  let finalSpec: SchematicSpec;
  
  if (isV12) {
    finalSpec = parsedSpec as SchematicSpec;
  } else {
    warnings.push("Converting alternative format to schematic spec v1.2");
    const pinTable = extractPinTable(raw);
    finalSpec = normalizeAltToV12(parsedSpec, pinTable || undefined);
  }
  
  return { spec: finalSpec, warnings };
}