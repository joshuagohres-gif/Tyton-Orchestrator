// /server/services/diagramLayout.ts
import { SchematicSpec } from "@/server/validation/schematicSpecValidator";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  group?: string;
  type?: string;
  label?: string;
  data?: any;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  data?: any;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

/**
 * Determine component group for layout clustering
 */
function getComponentGroup(component: any): string {
  const mpn = component.mpn?.toLowerCase() || '';
  const description = component.description?.toLowerCase() || '';
  const ref = component.ref?.toLowerCase() || '';
  
  // Power components
  if (ref.startsWith('j') || mpn.includes('connector') || description.includes('power input')) {
    return 'Power';
  }
  
  // MCUs and processors
  if (ref.startsWith('u') && (mpn.includes('esp32') || mpn.includes('stm32') || mpn.includes('arduino') || description.includes('mcu'))) {
    return 'MCU';
  }
  
  // Protection components
  if (ref.startsWith('f') || ref.startsWith('d') || mpn.includes('fuse') || mpn.includes('tvs') || description.includes('protection')) {
    return 'Protections';
  }
  
  // Connectors
  if (ref.startsWith('j') || ref.startsWith('p') || mpn.includes('connector') || description.includes('connector')) {
    return 'Connectors';
  }
  
  // Bus/Communication
  if (description.includes('i2c') || description.includes('spi') || description.includes('uart')) {
    return 'Buses';
  }
  
  // Default peripherals
  return 'Peripherals';
}

/**
 * Extract node-to-node connections from net members
 */
function parseNetMembers(netName: string, members: string[]): Array<{from: string, to: string, fromPin: string, toPin: string}> {
  const connections: Array<{from: string, to: string, fromPin: string, toPin: string}> = [];
  
  // Parse member format: "REF.PIN"
  const parsedMembers = members.map(member => {
    const [ref, pin] = member.split('.');
    return { ref: ref || member, pin: pin || '1' };
  });
  
  // Create connections between all pairs
  for (let i = 0; i < parsedMembers.length; i++) {
    for (let j = i + 1; j < parsedMembers.length; j++) {
      const from = parsedMembers[i];
      const to = parsedMembers[j];
      
      connections.push({
        from: from.ref,
        to: to.ref,
        fromPin: from.pin,
        toPin: to.pin
      });
    }
  }
  
  return connections;
}

/**
 * Compute layout using ELK.js (with fallback to grid layout)
 */
export async function computeLayout(spec: SchematicSpec): Promise<LayoutResult> {
  try {
    // Try to use ELK.js for proper graph layout
    return await computeElkLayout(spec);
  } catch (error) {
    console.warn('ELK.js layout failed, falling back to grid layout:', error.message);
    return createGridLayout(spec);
  }
}

/**
 * Compute layout using ELK.js
 */
async function computeElkLayout(spec: SchematicSpec): Promise<LayoutResult> {
  // Dynamic import to avoid issues during module resolution
  const ELK = await import('elkjs').then(m => m.default || m);
  
  // Create ELK instance for server-side use (no web workers)
  const elk = new ELK();
  
  // Create a minimal test graph first - this format WORKS
  const testGraph = {
    id: "root",
    layoutOptions: { "elk.algorithm": "layered" },
    children: [
      { id: "n1", width: 30, height: 30 },
      { id: "n2", width: 30, height: 30 },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" }
    ]
  };
  
  console.log('Testing minimal ELK graph...');
  try {
    const testResult = await elk.layout(testGraph);
    console.log('ELK test successful! Using real spec...');
    
    // Convert spec to ELK graph format
    const elkGraph = convertSpecToElkGraph(spec);
    console.log('ELK graph before layout:', JSON.stringify(elkGraph, null, 2));
    const layoutedGraph = await elk.layout(elkGraph);
    return convertElkGraphToLayout(layoutedGraph);
    
  } catch (testError) {
    console.log('ELK test failed:', testError.message);
    throw testError;
  }
}

/**
 * Convert SchematicSpec to ELK graph format
 */
function convertSpecToElkGraph(spec: SchematicSpec) {
  const nodes: any[] = [];
  const edges: any[] = [];
  const groupCounts: Record<string, number> = {};
  
  // Add components as nodes
  if (spec.components) {
    for (const component of spec.components) {
      const group = getComponentGroup(component);
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      
      nodes.push({
        id: component.ref,
        width: 120,
        height: 80
      });
    }
  }
  
  // Add connectors as nodes
  if (spec.connectors) {
    for (const connector of spec.connectors) {
      const group = 'Connectors';
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      
      nodes.push({
        id: connector.ref,
        width: 100,
        height: 60
      });
    }
  }
  
  // Add test points as nodes
  if (spec.testPoints) {
    for (const testPoint of spec.testPoints) {
      const nodeId = testPoint.refDes || testPoint.ref || `TP_${testPoint.net}`;
      const group = 'TestPoints';
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      
      nodes.push({
        id: nodeId,
        width: 60,
        height: 40
      });
    }
  }
  
  // Create node map for edge validation
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // Add edges from nets
  if (spec.nets) {
    for (const net of spec.nets) {
      const connections = parseNetMembers(net.name, net.members || []);
      
      for (const conn of connections) {
        // Only create edge if both nodes exist
        if (nodeMap.has(conn.from) && nodeMap.has(conn.to)) {
          edges.push({
            id: `${conn.from}_${conn.to}_${net.name}`,
            source: conn.from,
            target: conn.to
          });
        }
      }
    }
  }
  
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '10'
    },
    children: nodes,
    edges: edges
  };
}

/**
 * Convert ELK graph back to our LayoutResult format
 */
function convertElkGraphToLayout(elkGraph: any): LayoutResult {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  
  // Convert nodes
  if (elkGraph.children) {
    for (const elkNode of elkGraph.children) {
      nodes.push({
        id: elkNode.id,
        x: elkNode.x || 0,
        y: elkNode.y || 0,
        width: elkNode.width,
        height: elkNode.height,
        label: elkNode.id,
        // For now, simplified format without custom data
        group: 'Unknown',
        type: 'component',
        data: {}
      });
    }
  }
  
  // Convert edges
  if (elkGraph.edges) {
    for (const elkEdge of elkGraph.edges) {
      edges.push({
        id: elkEdge.id,
        source: elkEdge.source,
        target: elkEdge.target,
        type: 'signal',
        data: {}
      });
    }
  }
  
  return { nodes, edges };
}

/**
 * Create a simple grid layout as fallback
 */
export function createGridLayout(spec: SchematicSpec): LayoutResult {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  
  const groupPositions = {
    'Power': { x: 50, y: 50 },
    'Protections': { x: 50, y: 200 },
    'MCU': { x: 250, y: 125 },
    'Buses': { x: 450, y: 100 },
    'Peripherals': { x: 450, y: 250 },
    'Connectors': { x: 650, y: 125 },
    'TestPoints': { x: 650, y: 300 }
  };
  
  const groupCounts: Record<string, number> = {};
  
  // Add components
  if (spec.components) {
    for (const component of spec.components) {
      const group = getComponentGroup(component);
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      
      const basePos = groupPositions[group as keyof typeof groupPositions] || { x: 400, y: 200 };
      const offset = (groupCounts[group] - 1) * 150;
      
      nodes.push({
        id: component.ref,
        x: basePos.x,
        y: basePos.y + offset,
        width: 120,
        height: 80,
        group,
        type: 'component',
        label: `${component.ref}\n${component.mpn || 'UNKNOWN'}`,
        data: {
          ref: component.ref,
          mpn: component.mpn || 'UNKNOWN',
          description: component.description || '',
          pins: component.pins || []
        }
      });
    }
  }
  
  // Add connectors
  if (spec.connectors) {
    for (const connector of spec.connectors) {
      const group = 'Connectors';
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      
      const basePos = groupPositions[group];
      const offset = (groupCounts[group] - 1) * 150;
      
      nodes.push({
        id: connector.ref,
        x: basePos.x,
        y: basePos.y + offset,
        width: 100,
        height: 60,
        group,
        type: 'connector',
        label: `${connector.ref}\n${connector.type || 'CONNECTOR'}`,
        data: {
          ref: connector.ref,
          type: connector.type || 'CONNECTOR',
          description: connector.description || '',
          pins: connector.pins || []
        }
      });
    }
  }
  
  // Add test points
  if (spec.testPoints) {
    for (const testPoint of spec.testPoints) {
      const nodeId = testPoint.refDes || testPoint.ref || `TP_${testPoint.net}`;
      const group = 'TestPoints';
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      
      const basePos = groupPositions[group];
      const offset = (groupCounts[group] - 1) * 100;
      
      nodes.push({
        id: nodeId,
        x: basePos.x,
        y: basePos.y + offset,
        width: 60,
        height: 40,
        group,
        type: 'testpoint',
        label: `${nodeId}\n${testPoint.net}`,
        data: {
          ref: nodeId,
          net: testPoint.net,
          description: testPoint.description || ''
        }
      });
    }
  }
  
  // Create node map for edge validation
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  
  // Add edges from nets
  if (spec.nets) {
    for (const net of spec.nets) {
      const connections = parseNetMembers(net.name, net.members || []);
      
      for (const conn of connections) {
        // Only create edge if both nodes exist
        if (nodeMap.has(conn.from) && nodeMap.has(conn.to)) {
          edges.push({
            id: `${conn.from}_${conn.to}_${net.name}`,
            source: conn.from,
            target: conn.to,
            label: `${conn.fromPin}↔${conn.toPin}`,
            type: net.class?.toLowerCase() || 'signal',
            data: {
              net: net.name,
              netClass: net.class,
              fromPin: conn.fromPin,
              toPin: conn.toPin,
              props: net.props
            }
          });
        }
      }
    }
  }
  
  return { nodes, edges };
}