// app/workers/orchestration.worker.ts
/// <reference lib="webworker" />
import mitt from "mitt";
import { z } from "zod";

// --- Message protocol (typed with Zod)
const StartZ = z.object({ type: z.literal("start"), projectId: z.string(), options: z.object({
  resumeFromStage: z.string().optional(),
  maxConcurrency: z.number().int().min(1).max(6).default(3),
}).default({}) });

const ControlZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("recomputeLayout"), payload: z.any().optional() }),
]);

type Inbound = z.infer<typeof StartZ> | z.infer<typeof ControlZ>;

type Outbound =
  | { type: "status"; status: "starting"|"running"|"paused"|"cancelling"|"done"|"error"; detail?: any }
  | { type: "stage:progress"; stageId: string; status: "pending"|"running"|"done"|"error"; attempts?: number; message?: string }
  | { type: "ercdrc:update"; issues: { erc: any[]; drc: any[] } }
  | { type: "layout:ready"; nodes: any[]; edges: any[]; warnings?: string[] }
  | { type: "result"; summary: any }
  | { type: "error"; message: string };

const emitter = mitt(); // internal worker bus

let paused = false;
let cancelling = false;

// Helper: fetch wrapper with abort support (server endpoints only)
async function api(path: string, init?: RequestInit, signal?: AbortSignal) {
  const res = await fetch(path, { 
    ...init, 
    signal, 
    headers: { 
      "Content-Type":"application/json",
      "x-user-id": "test-user-id-12345",
      ...(init?.headers||{}) 
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res;
}

// Optional: ELK layout fallback inside the worker to avoid blocking UI
async function computeLayoutInWorker(specV12: any): Promise<{nodes:any[]; edges:any[]; warnings?:string[]}> {
  try {
    // Lazy import elkjs in the worker
    const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
    const elk = new ELK();
    
    // Convert specV12 → ELK graph
    const graph = {
      id: "root",
      layoutOptions: { 
        "elk.direction": "RIGHT",
        "elk.padding": "[top=25,left=25,bottom=25,right=25]",
        "elk.spacing.nodeNode": "25",
        "elk.layered.spacing.nodeNodeBetweenLayers": "50"
      },
      children: specV12?.modules?.map((module: any, index: number) => ({
        id: module.id || `module-${index}`,
        width: 200,
        height: 150,
        labels: [{ text: module.title || module.type || `Module ${index + 1}` }]
      })) || [],
      edges: specV12?.connections?.map((conn: any, index: number) => ({
        id: `edge-${index}`,
        sources: [conn.from],
        targets: [conn.to]
      })) || []
    };
    
    const layout = await elk.layout(graph, { 
      layoutOptions: { "elk.direction":"RIGHT" }
    });
    
    // Map layout → nodes/edges for React Flow
    const nodes = layout.children?.map((child) => ({
      id: child.id,
      type: 'custom',
      position: { x: child.x || 0, y: child.y || 0 },
      data: { 
        label: child.labels?.[0]?.text || child.id,
        width: child.width,
        height: child.height
      }
    })) || [];
    
    const edges = layout.edges?.map((edge) => ({
      id: edge.id,
      source: Array.isArray(edge.sources) ? edge.sources[0] : edge.sources,
      target: Array.isArray(edge.targets) ? edge.targets[0] : edge.targets,
      type: 'smoothstep'
    })) || [];
    
    return { nodes, edges };
  } catch (e:any) {
    return { nodes: [], edges: [], warnings: [String(e?.message||e)] };
  }
}

// Long-running controller: drives server pipeline via API, streams events to main thread
async function run(projectId: string, opts: { resumeFromStage?: string; maxConcurrency: number }) {
  try {
    // 1) Kick off server-side orchestration (server keeps secrets/LLM calls)
    postMessage({ type:"status", status:"starting" } satisfies Outbound);
    const start = await api(`/api/projects/${projectId}/orchestrator/start`, { 
      method:"POST", 
      body: JSON.stringify({ resumeFromStage: opts.resumeFromStage }) 
    });
    const startResult = await start.json();
    const runId = startResult.runId || startResult.orchestratorId;

    postMessage({ type:"status", status:"running", detail:{ runId } } satisfies Outbound);

    // 2) Poll status (or switch to SSE if available)
    const abort = new AbortController();
    const poll = async () => {
      while (!cancelling) {
        if (paused) { 
          await new Promise(r=>setTimeout(r, 300)); 
          continue; 
        }
        
        try {
          const res = await api(`/api/projects/${projectId}/orchestrator/status`, { 
            method:"GET" 
          }, abort.signal);
          const data = await res.json();
          
          // Emit live stage updates
          if (data.stages) {
            data.stages.forEach((s:any) => 
              postMessage({ 
                type:"stage:progress", 
                stageId: s.id, 
                status: s.status, 
                attempts: s.attempts, 
                message: s.message 
              } satisfies Outbound)
            );
          }
          
          // ERC/DRC updates
          if (data.issues) {
            postMessage({ type:"ercdrc:update", issues: data.issues } satisfies Outbound);
          }
          
          // Kick layout in worker for latest schematic (if provided)
          if (data.schematic?.specV12) {
            const layout = await computeLayoutInWorker(data.schematic.specV12);
            postMessage({ type:"layout:ready", ...layout } satisfies Outbound);
          }
          
          if (data.status === "done") {
            postMessage({ type:"result", summary: data.summary } satisfies Outbound);
            postMessage({ type:"status", status:"done" } satisfies Outbound);
            break;
          }
          
          if (data.status === "error") {
            postMessage({ 
              type:"error", 
              message: data.lastError || "pipeline error" 
            } satisfies Outbound);
            postMessage({ type:"status", status:"error" } satisfies Outbound);
            break;
          }
          
          await new Promise(r=>setTimeout(r, 800));
        } catch (error: any) {
          if (cancelling) break; // Expected during cancellation
          
          // Handle network errors gracefully
          console.warn('Polling error:', error.message);
          await new Promise(r=>setTimeout(r, 2000)); // Back off on errors
        }
      }
    };

    await poll();
  } catch (error: any) {
    postMessage({ 
      type:"error", 
      message: `Failed to start orchestration: ${error.message}` 
    } satisfies Outbound);
    postMessage({ type:"status", status:"error" } satisfies Outbound);
  }
}

self.onmessage = async (evt: MessageEvent) => {
  try {
    const payload = evt.data;
    
    if (payload?.type === "start") {
      const m = StartZ.parse(payload);
      paused = false; 
      cancelling = false;
      return void run(m.projectId, m.options || { maxConcurrency: 3 });
    }
    
    if (payload?.type === "pause") { 
      paused = true; 
      postMessage({ type:"status", status:"paused" } satisfies Outbound); 
      return; 
    }
    
    if (payload?.type === "resume") { 
      paused = false; 
      postMessage({ type:"status", status:"running" } satisfies Outbound); 
      return; 
    }
    
    if (payload?.type === "cancel") { 
      cancelling = true; 
      postMessage({ type:"status", status:"cancelling" } satisfies Outbound); 
      /* optional: call cancel API */ 
      return; 
    }
    
    if (payload?.type === "recomputeLayout") {
      // accept a spec payload from UI to recompute without polling
      const layout = await computeLayoutInWorker(payload.payload?.specV12);
      postMessage({ type:"layout:ready", ...layout } satisfies Outbound);
      return;
    }
  } catch (e:any) {
    postMessage({ type:"error", message: String(e?.message||e) } satisfies Outbound);
    postMessage({ type:"status", status:"error" } satisfies Outbound);
  }
};