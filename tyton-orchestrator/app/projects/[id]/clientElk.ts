"use client";
import { getElkInstance } from "@/server/services/elk"; // this works client-side too
import { specToElk } from "@/server/services/specToElk";

export async function clientCompute(spec: any) {
  console.log('[CLIENT_ELK] Computing layout on client side');
  
  try {
    const elk = await getElkInstance();
    const graph = specToElk(spec);
    
    console.log('[CLIENT_ELK] Starting client-side ELK layout');
    const layout = await elk.layout({
      id: graph.id,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "50",
        "elk.spacing.edgeNode": "20",
        ...(graph.layoutOptions || {}),
      },
      children: graph.children || [],
      edges: graph.edges || [],
    });
    
    console.log('[CLIENT_ELK] Client-side ELK layout completed');
    return layout;
    
  } catch (error) {
    console.error('[CLIENT_ELK] Client-side ELK layout failed:', error);
    throw error;
  }
}