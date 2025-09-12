import type { EdaSpecV1 } from "../specs/edaSpecV10";
import { buildNeutralNetlist } from "../build/netlist";

export interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, any>;
  children?: ElkNode[];
  ports?: ElkPort[];
  labels?: ElkLabel[];
}

export interface ElkPort {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, any>;
  labels?: ElkLabel[];
}

export interface ElkEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  sections?: ElkEdgeSection[];
  labels?: ElkLabel[];
}

export interface ElkEdgeSection {
  id: string;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  bendPoints?: { x: number; y: number }[];
}

export interface ElkLabel {
  id: string;
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ElkGraph {
  id: string;
  layoutOptions: Record<string, any>;
  children: ElkNode[];
  edges: ElkEdge[];
}

export interface LayoutOptions {
  algorithm?: "layered" | "force" | "stress" | "mrtree" | "rectpacking";
  direction?: "RIGHT" | "LEFT" | "UP" | "DOWN";
  nodeSpacing?: number;
  edgeSpacing?: number;
  layerSpacing?: number;
  portConstraints?: "FIXED_ORDER" | "FIXED_SIDE" | "FIXED_POS" | "FREE";
  separateConnectedComponents?: boolean;
  interactive?: boolean;
  hierarchyHandling?: "INCLUDE_CHILDREN" | "SEPARATE_CHILDREN";
}

export interface LayoutResult {
  graph: ElkGraph;
  width: number;
  height: number;
  components: Array<{
    ref: string;
    x: number;
    y: number;
    width: number;
    height: number;
    ports: Array<{
      id: string;
      x: number;
      y: number;
    }>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    points: Array<{ x: number; y: number }>;
  }>;
}

/**
 * Generate schematic layout using ELK.js algorithm
 */
export function generateSchematicLayout(
  eda: EdaSpecV1,
  options: LayoutOptions = {}
): LayoutResult {
  const opts: LayoutOptions = {
    algorithm: "layered",
    direction: "RIGHT",
    nodeSpacing: 50,
    edgeSpacing: 20,
    layerSpacing: 80,
    portConstraints: "FIXED_SIDE",
    separateConnectedComponents: true,
    interactive: false,
    hierarchyHandling: "INCLUDE_CHILDREN",
    ...options
  };

  // Build netlist for connectivity information
  const netlist = buildNeutralNetlist({
    version: "1.2",
    components: eda.components,
    nets: [],
    metadata: {}
  });

  // Create ELK graph from EDA spec
  const elkGraph = createElkGraph(eda, netlist, opts);

  // Apply layout algorithm (simplified - in real implementation would use ELK.js)
  const layoutResult = applyLayoutAlgorithm(elkGraph, opts);

  return layoutResult;
}

/**
 * Create ELK graph structure from EDA specification
 */
function createElkGraph(eda: EdaSpecV1, netlist: any, options: LayoutOptions): ElkGraph {
  const children: ElkNode[] = [];
  const edges: ElkEdge[] = [];

  // Create nodes for components
  for (const component of eda.components) {
    const node = createComponentNode(component);
    children.push(node);
  }

  // Create edges from netlist connections
  const edgeMap = new Map<string, { source: string; target: string; sourcePort: string; targetPort: string }[]>();

  for (const net of netlist.nets) {
    if (net.members.length < 2) continue;

    // Create edges between all pairs of pins on the same net
    for (let i = 0; i < net.members.length; i++) {
      for (let j = i + 1; j < net.members.length; j++) {
        const source = net.members[i];
        const target = net.members[j];
        
        const edgeId = `${net.name}_${i}_${j}`;
        edges.push({
          id: edgeId,
          source: source.ref,
          target: target.ref,
          sourcePort: `${source.ref}_pin_${source.pin}`,
          targetPort: `${target.ref}_pin_${target.pin}`,
          labels: [{
            id: `${edgeId}_label`,
            text: net.name,
            width: net.name.length * 8,
            height: 16
          }]
        });
      }
    }
  }

  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": options.algorithm,
      "elk.direction": options.direction,
      "elk.spacing.nodeNode": options.nodeSpacing?.toString(),
      "elk.layered.spacing.edgeNodeBetweenLayers": options.edgeSpacing?.toString(),
      "elk.layered.spacing.nodeNodeBetweenLayers": options.layerSpacing?.toString(),
      "elk.portConstraints": options.portConstraints,
      "elk.separateConnectedComponents": options.separateConnectedComponents?.toString(),
      "elk.interactive": options.interactive?.toString(),
      "elk.hierarchyHandling": options.hierarchyHandling
    },
    children,
    edges
  };
}

/**
 * Create ELK node for component
 */
function createComponentNode(component: any): ElkNode {
  const dimensions = estimateComponentDimensions(component);
  const ports = createComponentPorts(component);

  return {
    id: component.ref,
    width: dimensions.width,
    height: dimensions.height,
    ports,
    labels: [{
      id: `${component.ref}_label`,
      text: `${component.ref}\n${component.value || ""}`,
      width: Math.max(component.ref.length * 8, (component.value || "").length * 6),
      height: component.value ? 32 : 16
    }],
    layoutOptions: {
      "elk.portConstraints": "FIXED_SIDE",
      "elk.port.side": inferPortSides(component)
    }
  };
}

/**
 * Create ports for component pins
 */
function createComponentPorts(component: any): ElkPort[] {
  const ports: ElkPort[] = [];
  
  if (!component.pins || !Array.isArray(component.pins)) {
    return ports;
  }

  for (let i = 0; i < component.pins.length; i++) {
    const pin = component.pins[i];
    const portPosition = calculatePortPosition(component, pin, i);
    
    ports.push({
      id: `${component.ref}_pin_${pin.number || pin.name || i}`,
      width: 8,
      height: 8,
      x: portPosition.x,
      y: portPosition.y,
      labels: [{
        id: `${component.ref}_pin_${pin.number}_label`,
        text: pin.name || pin.number?.toString() || `${i + 1}`,
        width: (pin.name || pin.number?.toString() || `${i + 1}`).length * 6,
        height: 12
      }],
      layoutOptions: {
        "elk.port.side": portPosition.side,
        "elk.port.index": i.toString()
      }
    });
  }

  return ports;
}

/**
 * Apply layout algorithm (simplified implementation)
 */
function applyLayoutAlgorithm(graph: ElkGraph, options: LayoutOptions): LayoutResult {
  const components: LayoutResult["components"] = [];
  const edges: LayoutResult["edges"] = [];
  
  // Simple grid-based layout for demonstration
  const algorithm = options.algorithm || "layered";
  
  switch (algorithm) {
    case "layered":
      return applyLayeredLayout(graph, options);
    case "force":
      return applyForceLayout(graph, options);
    case "stress":
      return applyStressLayout(graph, options);
    case "rectpacking":
      return applyRectPackingLayout(graph, options);
    default:
      return applySimpleGridLayout(graph, options);
  }
}

/**
 * Apply layered layout (Sugiyama-style)
 */
function applyLayeredLayout(graph: ElkGraph, options: LayoutOptions): LayoutResult {
  const components: LayoutResult["components"] = [];
  const edges: LayoutResult["edges"] = [];

  // Analyze connectivity to determine layers
  const layers = assignComponentsToLayers(graph);
  
  let maxWidth = 0;
  let totalHeight = 0;
  const layerSpacing = options.layerSpacing || 80;
  const nodeSpacing = options.nodeSpacing || 50;

  // Position components in layers
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
    const layer = layers[layerIndex];
    const isVertical = options.direction === "UP" || options.direction === "DOWN";
    
    let layerWidth = 0;
    let layerHeight = 0;

    for (let nodeIndex = 0; nodeIndex < layer.length; nodeIndex++) {
      const node = layer[nodeIndex];
      const width = node.width || 60;
      const height = node.height || 40;

      let x, y;
      
      if (isVertical) {
        x = nodeIndex * (width + nodeSpacing);
        y = layerIndex * (height + layerSpacing);
      } else {
        x = layerIndex * (width + layerSpacing);
        y = nodeIndex * (height + nodeSpacing);
      }

      // Update positioned node
      node.x = x;
      node.y = y;

      // Calculate port positions
      const ports = (node.ports || []).map(port => ({
        id: port.id,
        x: x + (port.x || 0),
        y: y + (port.y || 0)
      }));

      components.push({
        ref: node.id,
        x,
        y,
        width,
        height,
        ports
      });

      layerWidth = Math.max(layerWidth, x + width);
      layerHeight = Math.max(layerHeight, y + height);
    }

    maxWidth = Math.max(maxWidth, layerWidth);
    totalHeight = Math.max(totalHeight, layerHeight);
  }

  // Create edges with routing points
  for (const edge of graph.edges) {
    const sourceComp = components.find(c => c.ref === edge.source);
    const targetComp = components.find(c => c.ref === edge.target);
    
    if (sourceComp && targetComp) {
      const sourcePort = sourceComp.ports.find(p => p.id === edge.sourcePort);
      const targetPort = targetComp.ports.find(p => p.id === edge.targetPort);
      
      const points = routeEdge(
        sourcePort ? { x: sourcePort.x, y: sourcePort.y } : { x: sourceComp.x + sourceComp.width / 2, y: sourceComp.y + sourceComp.height / 2 },
        targetPort ? { x: targetPort.x, y: targetPort.y } : { x: targetComp.x + targetComp.width / 2, y: targetComp.y + targetComp.height / 2 },
        options
      );

      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        points
      });
    }
  }

  return {
    graph,
    width: maxWidth + 50, // Add margin
    height: totalHeight + 50,
    components,
    edges
  };
}

/**
 * Apply force-directed layout
 */
function applyForceLayout(graph: ElkGraph, options: LayoutOptions): LayoutResult {
  const components: LayoutResult["components"] = [];
  const edges: LayoutResult["edges"] = [];

  // Simple circular arrangement for force layout
  const nodes = graph.children;
  const radius = Math.max(100, nodes.length * 20);
  const centerX = radius + 50;
  const centerY = radius + 50;

  for (let i = 0; i < nodes.length; i++) {
    const angle = (2 * Math.PI * i) / nodes.length;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    
    const node = nodes[i];
    const width = node.width || 60;
    const height = node.height || 40;

    node.x = x - width / 2;
    node.y = y - height / 2;

    const ports = (node.ports || []).map(port => ({
      id: port.id,
      x: node.x! + (port.x || width / 2),
      y: node.y! + (port.y || height / 2)
    }));

    components.push({
      ref: node.id,
      x: node.x,
      y: node.y,
      width,
      height,
      ports
    });
  }

  // Route edges
  for (const edge of graph.edges) {
    const sourceComp = components.find(c => c.ref === edge.source);
    const targetComp = components.find(c => c.ref === edge.target);
    
    if (sourceComp && targetComp) {
      const points = [
        { x: sourceComp.x + sourceComp.width / 2, y: sourceComp.y + sourceComp.height / 2 },
        { x: targetComp.x + targetComp.width / 2, y: targetComp.y + targetComp.height / 2 }
      ];

      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        points
      });
    }
  }

  const boundingSize = (radius + 100) * 2;
  return {
    graph,
    width: boundingSize,
    height: boundingSize,
    components,
    edges
  };
}

/**
 * Apply stress minimization layout
 */
function applyStressLayout(graph: ElkGraph, options: LayoutOptions): LayoutResult {
  // For now, use the same as force layout
  return applyForceLayout(graph, options);
}

/**
 * Apply rectangle packing layout
 */
function applyRectPackingLayout(graph: ElkGraph, options: LayoutOptions): LayoutResult {
  const components: LayoutResult["components"] = [];
  const edges: LayoutResult["edges"] = [];
  
  // Simple bin packing algorithm
  const nodes = graph.children;
  const spacing = options.nodeSpacing || 20;
  
  let currentX = spacing;
  let currentY = spacing;
  let rowHeight = 0;
  let maxWidth = 0;
  const maxRowWidth = 800; // Maximum width before wrapping

  for (const node of nodes) {
    const width = node.width || 60;
    const height = node.height || 40;

    // Check if we need to wrap to next row
    if (currentX + width > maxRowWidth) {
      currentX = spacing;
      currentY += rowHeight + spacing;
      rowHeight = 0;
    }

    node.x = currentX;
    node.y = currentY;

    const ports = (node.ports || []).map(port => ({
      id: port.id,
      x: currentX + (port.x || width / 2),
      y: currentY + (port.y || height / 2)
    }));

    components.push({
      ref: node.id,
      x: currentX,
      y: currentY,
      width,
      height,
      ports
    });

    currentX += width + spacing;
    rowHeight = Math.max(rowHeight, height);
    maxWidth = Math.max(maxWidth, currentX);
  }

  // Simple direct routing for edges
  for (const edge of graph.edges) {
    const sourceComp = components.find(c => c.ref === edge.source);
    const targetComp = components.find(c => c.ref === edge.target);
    
    if (sourceComp && targetComp) {
      const points = [
        { x: sourceComp.x + sourceComp.width / 2, y: sourceComp.y + sourceComp.height / 2 },
        { x: targetComp.x + targetComp.width / 2, y: targetComp.y + targetComp.height / 2 }
      ];

      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        points
      });
    }
  }

  return {
    graph,
    width: maxWidth,
    height: currentY + rowHeight + spacing,
    components,
    edges
  };
}

/**
 * Apply simple grid layout (fallback)
 */
function applySimpleGridLayout(graph: ElkGraph, options: LayoutOptions): LayoutResult {
  const components: LayoutResult["components"] = [];
  const edges: LayoutResult["edges"] = [];

  const nodes = graph.children;
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const spacing = options.nodeSpacing || 80;

  for (let i = 0; i < nodes.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    
    const node = nodes[i];
    const width = node.width || 60;
    const height = node.height || 40;
    
    const x = col * spacing;
    const y = row * spacing;
    
    node.x = x;
    node.y = y;

    const ports = (node.ports || []).map(port => ({
      id: port.id,
      x: x + (port.x || width / 2),
      y: y + (port.y || height / 2)
    }));

    components.push({
      ref: node.id,
      x,
      y,
      width,
      height,
      ports
    });
  }

  // Simple direct routing
  for (const edge of graph.edges) {
    const sourceComp = components.find(c => c.ref === edge.source);
    const targetComp = components.find(c => c.ref === edge.target);
    
    if (sourceComp && targetComp) {
      const points = [
        { x: sourceComp.x + sourceComp.width / 2, y: sourceComp.y + sourceComp.height / 2 },
        { x: targetComp.x + targetComp.width / 2, y: targetComp.y + targetComp.height / 2 }
      ];

      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        points
      });
    }
  }

  const width = cols * spacing + 60;
  const height = Math.ceil(nodes.length / cols) * spacing + 40;

  return {
    graph,
    width,
    height,
    components,
    edges
  };
}

// Helper functions

function estimateComponentDimensions(component: any): { width: number; height: number } {
  const footprint = component.footprint?.toLowerCase() || "";
  const pinCount = component.pins?.length || 2;
  
  // Base dimensions
  let width = 60;
  let height = 40;
  
  // Adjust based on footprint
  if (footprint.includes("soic") || footprint.includes("tssop")) {
    width = Math.max(60, pinCount * 6);
    height = 30;
  } else if (footprint.includes("dip")) {
    width = Math.max(80, pinCount * 5);
    height = 40;
  } else if (footprint.includes("qfn") || footprint.includes("qfp")) {
    const side = Math.ceil(Math.sqrt(pinCount));
    width = height = Math.max(50, side * 8);
  } else if (footprint.includes("0603") || footprint.includes("0805")) {
    width = 30;
    height = 20;
  }
  
  // Adjust for reference designator and value text
  const refLength = component.ref.length * 8;
  const valueLength = (component.value || "").length * 6;
  width = Math.max(width, refLength, valueLength);
  
  return { width, height };
}

function calculatePortPosition(component: any, pin: any, index: number): { x: number; y: number; side: string } {
  const dims = estimateComponentDimensions(component);
  const pinCount = component.pins?.length || 1;
  
  // Determine which side of the component the pin should be on
  const pinNumber = parseInt(pin.number) || (index + 1);
  const footprint = component.footprint?.toLowerCase() || "";
  
  if (footprint.includes("dip")) {
    // DIP: pins 1-N/2 on left, N/2+1-N on right
    const isLeftSide = pinNumber <= Math.ceil(pinCount / 2);
    return {
      x: isLeftSide ? 0 : dims.width,
      y: (pinNumber - 1) * (dims.height / Math.ceil(pinCount / 2)),
      side: isLeftSide ? "WEST" : "EAST"
    };
  } else if (footprint.includes("soic")) {
    // SOIC: similar to DIP
    const isLeftSide = pinNumber <= Math.ceil(pinCount / 2);
    return {
      x: isLeftSide ? 0 : dims.width,
      y: ((pinNumber - 1) % Math.ceil(pinCount / 2)) * (dims.height / Math.ceil(pinCount / 2)),
      side: isLeftSide ? "WEST" : "EAST"
    };
  } else if (footprint.includes("qfn") || footprint.includes("qfp")) {
    // QFN/QFP: distribute around perimeter
    const pinsPerSide = Math.ceil(pinCount / 4);
    const sideIndex = Math.floor((pinNumber - 1) / pinsPerSide);
    const posOnSide = (pinNumber - 1) % pinsPerSide;
    
    switch (sideIndex) {
      case 0: // Bottom
        return { x: (posOnSide + 1) * dims.width / (pinsPerSide + 1), y: dims.height, side: "SOUTH" };
      case 1: // Right
        return { x: dims.width, y: dims.height - (posOnSide + 1) * dims.height / (pinsPerSide + 1), side: "EAST" };
      case 2: // Top
        return { x: dims.width - (posOnSide + 1) * dims.width / (pinsPerSide + 1), y: 0, side: "NORTH" };
      case 3: // Left
        return { x: 0, y: (posOnSide + 1) * dims.height / (pinsPerSide + 1), side: "WEST" };
      default:
        return { x: dims.width / 2, y: dims.height / 2, side: "SOUTH" };
    }
  } else {
    // Default: distribute pins around perimeter
    const isInput = pin.type === "input";
    return {
      x: isInput ? 0 : dims.width,
      y: index * (dims.height / pinCount),
      side: isInput ? "WEST" : "EAST"
    };
  }
}

function inferPortSides(component: any): string {
  // This would analyze pin types to determine optimal port placement
  return "FIXED_SIDE";
}

function assignComponentsToLayers(graph: ElkGraph): ElkNode[][] {
  const layers: ElkNode[][] = [];
  const visited = new Set<string>();
  const nodeMap = new Map<string, ElkNode>();
  
  // Build node map
  for (const node of graph.children) {
    nodeMap.set(node.id, node);
  }
  
  // Build adjacency list from edges
  const adjacency = new Map<string, string[]>();
  for (const node of graph.children) {
    adjacency.set(node.id, []);
  }
  
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }
  
  // Simple layering: BFS from nodes with no incoming edges
  const queue: string[] = [];
  const inDegree = new Map<string, number>();
  
  // Calculate in-degrees
  for (const node of graph.children) {
    inDegree.set(node.id, 0);
  }
  
  for (const edge of graph.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }
  
  // Start with nodes that have no incoming edges
  for (const node of graph.children) {
    if ((inDegree.get(node.id) || 0) === 0) {
      queue.push(node.id);
    }
  }
  
  // If no nodes with 0 in-degree, start with first node
  if (queue.length === 0 && graph.children.length > 0) {
    queue.push(graph.children[0].id);
  }
  
  // Assign layers using topological sort
  while (queue.length > 0) {
    const currentLayer: ElkNode[] = [];
    const layerSize = queue.length;
    
    for (let i = 0; i < layerSize; i++) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      const node = nodeMap.get(nodeId)!;
      currentLayer.push(node);
      
      // Add neighbors to next layer
      for (const neighbor of adjacency.get(nodeId) || []) {
        if (!visited.has(neighbor)) {
          const currentInDegree = inDegree.get(neighbor) || 0;
          inDegree.set(neighbor, currentInDegree - 1);
          if (currentInDegree - 1 === 0) {
            queue.push(neighbor);
          }
        }
      }
    }
    
    if (currentLayer.length > 0) {
      layers.push(currentLayer);
    }
  }
  
  // Add any remaining unvisited nodes
  const remainingNodes = graph.children.filter(node => !visited.has(node.id));
  if (remainingNodes.length > 0) {
    layers.push(remainingNodes);
  }
  
  return layers;
}

function routeEdge(start: { x: number; y: number }, end: { x: number; y: number }, options: LayoutOptions): { x: number; y: number }[] {
  // Simple orthogonal routing
  const points: { x: number; y: number }[] = [start];
  
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal first
    points.push({ x: start.x + dx / 2, y: start.y });
    points.push({ x: start.x + dx / 2, y: end.y });
  } else {
    // Vertical first
    points.push({ x: start.x, y: start.y + dy / 2 });
    points.push({ x: end.x, y: start.y + dy / 2 });
  }
  
  points.push(end);
  return points;
}

/**
 * Convert layout result back to EDA placement
 */
export function applyLayoutToEda(eda: EdaSpecV1, layoutResult: LayoutResult): EdaSpecV1 {
  const updatedPlacement = layoutResult.components.map(comp => ({
    ref: comp.ref,
    x: comp.x + comp.width / 2, // Center position
    y: comp.y + comp.height / 2,
    rotation: 0,
    side: "front" as const
  }));

  return {
    ...eda,
    placement: updatedPlacement,
    board: {
      ...eda.board,
      width: eda.board?.width || layoutResult.width,
      height: eda.board?.height || layoutResult.height
    }
  };
}

/**
 * Generate layout statistics
 */
export function getLayoutStats(layoutResult: LayoutResult): {
  componentCount: number;
  edgeCount: number;
  totalArea: number;
  averageEdgeLength: number;
  crossingCount: number;
  aspectRatio: number;
} {
  const componentCount = layoutResult.components.length;
  const edgeCount = layoutResult.edges.length;
  const totalArea = layoutResult.width * layoutResult.height;
  
  // Calculate average edge length
  let totalEdgeLength = 0;
  for (const edge of layoutResult.edges) {
    let edgeLength = 0;
    for (let i = 0; i < edge.points.length - 1; i++) {
      const p1 = edge.points[i];
      const p2 = edge.points[i + 1];
      edgeLength += Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }
    totalEdgeLength += edgeLength;
  }
  const averageEdgeLength = edgeCount > 0 ? totalEdgeLength / edgeCount : 0;
  
  // Simple crossing count estimation (would need more sophisticated algorithm)
  let crossingCount = 0;
  
  const aspectRatio = layoutResult.height > 0 ? layoutResult.width / layoutResult.height : 1;
  
  return {
    componentCount,
    edgeCount,
    totalArea,
    averageEdgeLength,
    crossingCount,
    aspectRatio
  };
}