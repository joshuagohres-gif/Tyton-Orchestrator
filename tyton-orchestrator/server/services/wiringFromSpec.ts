// /server/services/wiringFromSpec.ts
import type { SchematicSpec } from "@/server/validation/schematicSpecValidator";

type Edge = { fromModuleId: string; toModuleId: string; label: string; meta?: any };

export function buildWiringArtifacts(spec: SchematicSpec): {
  wiringMd: string;
  wiringJson: any;
  edges: Edge[];
} {
  // Map REF -> moduleId (fallback to ref itself; front-end can later map)
  // In a real app, you'd resolve by ref or componentId to Module rows
  const refToModuleId: Record<string, string> = {}; // leave blank; front-end can resolve later if needed

  const lines: string[] = [];
  const wiringJson: any[] = [];
  const edges: Edge[] = [];

  lines.push(`# Wiring Instructions\n`);
  lines.push(`> Generated from schematicSpec v${spec.version}. Grouped by net.\n`);

  // Add power tree overview
  if (spec.powerTree?.rails?.length > 0) {
    lines.push(`\n## Power Distribution\n`);
    spec.powerTree.rails.forEach(rail => {
      lines.push(`- **${rail.name}**: ${rail.voltage}V @ ${rail.current}A (${rail.regulation}) from ${rail.source}`);
    });
  }

  // Add bus overview
  if (spec.buses?.length > 0) {
    lines.push(`\n## Communication Buses\n`);
    spec.buses.forEach(bus => {
      const deviceList = bus.devices.map(d => `${d.refDes}(${d.role}${d.address !== 'N/A' ? '@' + d.address : ''})`).join(', ');
      lines.push(`- **${bus.name}** (${bus.type}): ${deviceList}`);
      lines.push(`  - Nets: ${bus.nets.join(', ')}`);
    });
  }

  // Process nets for detailed wiring
  lines.push(`\n## Detailed Wiring by Net\n`);
  
  for (const net of spec.nets) {
    if (!net.members || net.members.length < 2) continue;
    
    lines.push(`\n### Net: \`${net.name}\` (${net.class})`);
    
    if (net.props && Object.keys(net.props).length > 0) {
      const propStrings = Object.entries(net.props).map(([k, v]) => `${k}=${v}`);
      lines.push(`- Properties: ${propStrings.join(", ")}`);
    }

    // Add net-specific notes
    if (net.class === 'power') {
      const rail = spec.powerTree?.rails?.find(r => r.name === net.name);
      if (rail) {
        lines.push(`- Power: ${rail.voltage}V @ ${rail.current}A`);
      }
    }

    // For each pair of consecutive members, create a connection instruction
    // Also emit edges (component to MCU or between parts)
    const pairs = pairwise(net.members);
    
    lines.push(`\n**Connections:**`);
    for (const [a, b] of pairs) {
      const [refA, pinA] = a.split(".");
      const [refB, pinB] = b.split(".");
      const label = `${pinA} ↔ ${pinB}`;

      lines.push(`- Connect **${refA}.${pinA}** to **${refB}.${pinB}**`);

      wiringJson.push({ 
        net: net.name, 
        a: { ref: refA, pin: pinA }, 
        b: { ref: refB, pin: pinB }, 
        class: net.class,
        props: net.props 
      });

      edges.push({
        fromModuleId: refToModuleId[refA] || refA,
        toModuleId: refToModuleId[refB] || refB,
        label,
        meta: { net: net.name, class: net.class, props: net.props }
      });
    }
  }

  // Add protection components
  if (spec.protections?.length > 0) {
    lines.push(`\n## Protection Components\n`);
    spec.protections.forEach(protection => {
      lines.push(`- **${protection.refDes}** (${protection.type}): ${protection.rating}`);
      lines.push(`  - ${protection.rationale}`);
    });
  }

  // Add decoupling information
  if (spec.decoupling?.length > 0) {
    lines.push(`\n## Decoupling & Support Components\n`);
    spec.decoupling.forEach(cap => {
      lines.push(`- **${cap.refDes}**: ${cap.value} ${cap.voltage} ${cap.type}`);
      lines.push(`  - Placement: ${cap.placement}`);
      lines.push(`  - Purpose: ${cap.rationale}`);
    });
  }

  // Add connector information
  if (spec.connectors?.length > 0) {
    lines.push(`\n## Connectors\n`);
    spec.connectors.forEach(conn => {
      lines.push(`- **${conn.refDes}** (${conn.type}): ${conn.description}`);
      Object.entries(conn.pinout).forEach(([pin, signal]) => {
        lines.push(`  - Pin ${pin}: ${signal}`);
      });
    });
  }

  // Add test points
  if (spec.testPoints?.length > 0) {
    lines.push(`\n## Test Points\n`);
    spec.testPoints.forEach(tp => {
      lines.push(`- **${tp.refDes}**: ${tp.net} - ${tp.description}`);
    });
  }

  // ERC summary
  if (spec.erc?.length) {
    lines.push(`\n---\n## ERC Notes\n`);
    spec.erc.forEach(e => {
      const emoji = e.type === 'error' ? '❌' : e.type === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`- ${emoji} ${e.issue}: ${e.details} (${e.severity})`);
    });
  }

  // Add assumptions and open questions
  if (spec.assumptions?.length > 0) {
    lines.push(`\n## Design Assumptions\n`);
    spec.assumptions.forEach(assumption => {
      lines.push(`- ${assumption}`);
    });
  }

  if (spec.openQuestions?.length > 0) {
    lines.push(`\n## Open Questions\n`);
    spec.openQuestions.forEach(question => {
      lines.push(`- ${question}`);
    });
  }

  return { wiringMd: lines.join("\n"), wiringJson, edges };
}

function pairwise<T>(arr: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < arr.length - 1; i++) out.push([arr[i], arr[i+1]]);
  return out;
}