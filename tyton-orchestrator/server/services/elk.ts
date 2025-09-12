// /server/services/elk.ts
// Isomorphic ELK loader with environment-aware import and safety timeouts.

export type ElkGraph = {
  id: string;
  layoutOptions?: Record<string, string>;
  children?: Array<{ id: string; width?: number; height?: number; labels?: any[]; }>;
  edges?: Array<{ id: string; sources: string[]; targets: string[]; labels?: any[] }>;
};

export type ElkLayout = ElkGraph & {
  x?: number; y?: number;
  children?: Array<{ id: string; x: number; y: number; width: number; height: number; }>;
  edges?: Array<{ id: string; sections?: { startPoint: any; endPoint: any; bendPoints?: any[] }[] }>;
};

export async function getElkInstance(): Promise<any> {
  console.log('[ELK] Getting ELK instance for environment:', typeof window === 'undefined' ? 'server' : 'browser');
  
  // Server: use 'elkjs' (Node-friendly)
  if (typeof window === "undefined") {
    console.log('[ELK] Loading server-side elkjs');
    const { default: ELK } = await import("elkjs"); // ESM default
    return new ELK();
  }
  
  // Browser: use bundled build
  console.log('[ELK] Loading browser-side elk.bundled.js');
  const mod = await import("elkjs/lib/elk.bundled.js");
  const ELK = (mod as any).default || (mod as any);
  return new ELK();
}

export async function computeElkLayout(graph: ElkGraph, timeoutMs = 8000): Promise<ElkLayout> {
  const startTime = Date.now();
  console.log(`[ELK] Computing layout for graph with ${graph.children?.length || 0} nodes and ${graph.edges?.length || 0} edges`);
  
  const elk = await getElkInstance();
  const controller = new AbortController();
  const t = setTimeout(() => {
    console.log(`[ELK] Layout timeout after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);
  
  try {
    const layout = await elk.layout(
      {
        id: graph.id,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.spacing.nodeNode": "40",
          "elk.layered.spacing.nodeNodeBetweenLayers": "50",
          "elk.spacing.edgeNode": "20",
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
          ...(graph.layoutOptions || {}),
        },
        children: graph.children || [],
        edges: graph.edges || [],
      },
      { signal: controller.signal as any }
    );
    
    const duration = Date.now() - startTime;
    console.log(`[ELK] Layout completed in ${duration}ms`);
    return layout as ElkLayout;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ELK] Layout failed after ${duration}ms:`, error);
    throw error;
  } finally {
    clearTimeout(t);
  }
}