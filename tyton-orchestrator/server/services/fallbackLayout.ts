// /server/services/fallbackLayout.ts
export function gridLayout(elkLikeGraph: { children?: any[]; edges?: any[] }) {
  console.log('[FALLBACK] Using grid layout fallback');
  
  const nodes = elkLikeGraph.children || [];
  const cols = Math.ceil(Math.sqrt(nodes.length || 1));
  const spacingX = 220, spacingY = 140;
  
  nodes.forEach((n: any, i: number) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    n.x = col * spacingX;
    n.y = row * spacingY;
    console.log(`[FALLBACK] Positioned node ${n.id} at (${n.x}, ${n.y})`);
  });
  
  console.log(`[FALLBACK] Grid layout completed with ${nodes.length} nodes in ${cols} columns`);
  
  return { ...elkLikeGraph };
}

// Optional: Dagre fallback (more sophisticated than grid)
export async function dagreLayout(elkLikeGraph: { children?: any[]; edges?: any[] }) {
  try {
    console.log('[FALLBACK] Using Dagre layout fallback');
    
    // Dynamic import since dagre might not be available in all environments
    const dagre = await import('dagre');
    const g = new dagre.graphlib.Graph();
    
    g.setGraph({});
    g.setDefaultEdgeLabel(() => ({}));
    
    // Add nodes
    (elkLikeGraph.children || []).forEach((node: any) => {
      g.setNode(node.id, { width: node.width || 160, height: node.height || 80 });
    });
    
    // Add edges
    (elkLikeGraph.edges || []).forEach((edge: any) => {
      if (edge.sources?.[0] && edge.targets?.[0]) {
        g.setEdge(edge.sources[0], edge.targets[0]);
      }
    });
    
    dagre.layout(g);
    
    // Extract positions
    const nodes = elkLikeGraph.children || [];
    nodes.forEach((node: any) => {
      const dagreNode = g.node(node.id);
      if (dagreNode) {
        node.x = dagreNode.x - (dagreNode.width / 2);
        node.y = dagreNode.y - (dagreNode.height / 2);
        console.log(`[FALLBACK] Dagre positioned node ${node.id} at (${node.x}, ${node.y})`);
      }
    });
    
    console.log(`[FALLBACK] Dagre layout completed`);
    return { ...elkLikeGraph };
    
  } catch (error) {
    console.warn('[FALLBACK] Dagre layout failed, falling back to grid:', error);
    return gridLayout(elkLikeGraph);
  }
}