"use client";
import { useState, useEffect, useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { clientCompute } from "./clientElk";

type LayoutResponse = {
  ok: boolean;
  layout?: { children?: any[]; edges?: any[] };
  errors?: any[]; warnings?: any[];
  error?: string;
  meta?: {
    duration: number;
    nodeCount: number;
    edgeCount: number;
    layoutEngine: string;
  };
};

interface DiagramPanelProps {
  projectId: string;
  spec: any;
}

export function DiagramPanel({ projectId, spec }: DiagramPanelProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [issues, setIssues] = useState<{ errors: any[]; warnings: any[] }>({ errors: [], warnings: [] });
  const [layoutEngine, setLayoutEngine] = useState<'elk' | 'dagre' | 'grid'>('elk');
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [useClientFallback, setUseClientFallback] = useState(false);

  async function runLayout() {
    setStatus("loading");
    setIssues({ errors: [], warnings: [] });
    
    try {
      if (useClientFallback) {
        console.log('[DIAGRAM_PANEL] Using client-side computation');
        const layout = await clientCompute(spec);
        handleLayoutSuccess({ ok: true, layout }, 'client-elk');
      } else {
        console.log(`[DIAGRAM_PANEL] Using server-side ${layoutEngine} layout`);
        // Use the existing working schematic/render route with robust ELK integration
        const res = await fetch(`/api/projects/${projectId}/schematic/render`, {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            raw: JSON.stringify(spec),
            persist: false  // Don't persist, just get layout
          })
        });
        
        const data: LayoutResponse = await res.json();
        
        if (!data.ok || !data.layout) {
          throw new Error(data.error || "Layout failed");
        }
        
        handleLayoutSuccess(data, data.meta?.layoutEngine || layoutEngine);
      }
    } catch (err: any) {
      console.error("[DIAGRAM_PANEL] Layout error:", err);
      setStatus("error");
      setIssues({ errors: [err.message], warnings: [] });
    }
  }

  function handleLayoutSuccess(data: LayoutResponse, engine: string) {
    console.log(`[DIAGRAM_PANEL] Layout success with ${engine}`);
    
    // Map ELK nodes/edges → React Flow
    const rfNodes = (data.layout?.children || []).map((n: any) => ({
      id: String(n.id),
      position: { x: n.x || 0, y: n.y || 0 },
      data: { 
        label: String(n.id),
        width: n.width || 160,
        height: n.height || 80
      },
      style: { 
        width: Math.max(140, n.width || 160), 
        height: Math.max(60, n.height || 80),
        background: '#ffffff',
        border: '2px solid #1f2937',
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 'bold'
      }
    }));
    
    const rfEdges = (data.layout?.edges || []).map((e: any) => ({
      id: String(e.id),
      source: String(e.sources?.[0]),
      target: String(e.targets?.[0]),
      label: String(e.labels?.[0]?.text || ""),
      animated: false,
      style: { stroke: '#6366f1', strokeWidth: 2 }
    }));
    
    setNodes(rfNodes);
    setEdges(rfEdges);
    setIssues({ errors: data.errors || [], warnings: data.warnings || [] });
    setDebugInfo(data.meta);
    setStatus("ready");
  }

  useEffect(() => { 
    if (spec) {
      runLayout(); 
    }
  }, [projectId, layoutEngine]);

  const statusColor = {
    idle: 'text-gray-600',
    loading: 'text-blue-600',
    error: 'text-red-600',
    ready: 'text-green-600'
  }[status];

  return (
    <div className="h-[70vh] border rounded-md flex bg-white">
      <div className="w-64 p-3 border-r space-y-3 bg-gray-50">
        <h3 className="font-semibold text-gray-800">Diagram Controls</h3>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Layout Engine:</label>
          <select 
            value={layoutEngine} 
            onChange={(e) => setLayoutEngine(e.target.value as any)}
            className="w-full px-2 py-1 border rounded text-sm"
            disabled={status === 'loading'}
          >
            <option value="elk">ELK.js (Preferred)</option>
            <option value="dagre">Dagre (Fast)</option>
            <option value="grid">Grid (Simple)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={useClientFallback}
              onChange={(e) => setUseClientFallback(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">Client-side fallback</span>
          </label>
        </div>
        
        <button 
          onClick={runLayout} 
          disabled={status === 'loading'}
          className="px-3 py-2 rounded bg-black text-white w-full disabled:bg-gray-400 transition-colors"
        >
          {status === 'loading' ? 'Computing...' : 'Recompute Layout'}
        </button>
        
        <div className="text-sm space-y-1">
          <div>Status: <span className={`font-medium ${statusColor}`}>{status}</span></div>
          
          {status === "error" && (
            <div className="text-red-600 text-xs">
              Layout failed. Check console & validator.
            </div>
          )}
          
          {!!issues.errors?.length && (
            <div className="text-red-700 text-xs">
              Errors: {issues.errors.length}
            </div>
          )}
          
          {!!issues.warnings?.length && (
            <div className="text-yellow-700 text-xs">
              Warnings: {issues.warnings.length}
            </div>
          )}

          {debugInfo && (
            <div className="text-xs text-gray-600 space-y-1">
              <div>Nodes: {debugInfo.nodeCount}</div>
              <div>Edges: {debugInfo.edgeCount}</div>
              <div>Duration: {debugInfo.duration}ms</div>
              <div>Engine: {debugInfo.layoutEngine}</div>
            </div>
          )}
          
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showDebug ? 'Hide' : 'Show'} Debug Info
          </button>
          
          {showDebug && debugInfo && (
            <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Interactive schematic diagram with automatic layout positioning.
        </p>
      </div>
      
      <div className="flex-1 bg-gray-100">
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={onNodesChange} 
          onEdgesChange={onEdgesChange} 
          fitView
          className="bg-white"
        >
          <Controls />
          <MiniMap 
            style={{ height: 80, width: 120 }}
            zoomable
            pannable
          />
          <Background />
        </ReactFlow>
      </div>
    </div>
  );
}