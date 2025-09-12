// /server/services/specToElk.ts
import type { SchematicSpec } from "@/server/validation/schematicSpecValidator";

export function specToElk(spec: SchematicSpec) {
  console.log('[SPEC_TO_ELK] Converting schematic spec to ELK graph');
  
  const nodeWidth = 160;
  const nodeHeight = 80;

  const idForRef = (ref: string) => ref; // stable
  const nodes = new Map<string, { id: string; width: number; height: number }>();

  // Components, connectors, protections, testPoints as nodes
  const addNode = (ref: string) => {
    if (!nodes.has(ref)) {
      nodes.set(ref, { id: idForRef(ref), width: nodeWidth, height: nodeHeight });
      console.log(`[SPEC_TO_ELK] Added node: ${ref}`);
    }
  };

  // Add all components as nodes
  (spec.components || []).forEach(c => addNode(c.ref));
  (spec.connectors || []).forEach(c => addNode(c.ref));
  (spec.protections || []).forEach(p => addNode(p.ref));
  (spec.testPoints || []).forEach(tp => addNode(tp.ref));
  
  // If powerTree regs exist without explicit components:
  (spec.powerTree || []).forEach(pt => pt.downstream?.forEach(d => addNode(d.reg)));

  // Edges from nets
  const edges: Array<{ id: string; sources: string[]; targets: string[]; labels?: any[] }> = [];
  let edgeIdx = 0;

  for (const net of spec.nets || []) {
    console.log(`[SPEC_TO_ELK] Processing net: ${net.name} with ${net.members?.length || 0} members`);
    
    // connect sequential members: A-B, B-C, etc. (simple)
    for (let i = 0; i < (net.members?.length || 0) - 1; i++) {
      const a = net.members![i];
      const b = net.members![i + 1];
      const [refA] = a.split(".");
      const [refB] = b.split(".");
      
      if (!refA || !refB) {
        console.warn(`[SPEC_TO_ELK] Skipping invalid net members: ${a} -> ${b}`);
        continue;
      }
      
      addNode(refA); 
      addNode(refB);
      
      edges.push({
        id: `e_${edgeIdx++}_${net.name}`,
        sources: [idForRef(refA)],
        targets: [idForRef(refB)],
        labels: [{ text: net.name }]
      });
      
      console.log(`[SPEC_TO_ELK] Added edge: ${refA} -> ${refB} (${net.name})`);
    }
  }

  const elkGraph = {
    id: "schematic",
    layoutOptions: {},
    children: Array.from(nodes.values()),
    edges
  };

  console.log(`[SPEC_TO_ELK] Generated ELK graph with ${elkGraph.children.length} nodes and ${elkGraph.edges.length} edges`);
  
  return elkGraph;
}