'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import CopilotPanel from '@/components/CopilotPanel';
import ProjectCanvas from '@/components/ProjectCanvas';
import BOMModal from '@/components/BOMModal';
import SourcingModal from '@/components/SourcingModal';
import CircuitModal from '@/components/CircuitModal';
import { AlertTriangle, Package, ShoppingCart, ExternalLink, Zap, Shield, ShieldOff, Play, Pause, Square } from 'lucide-react';

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;
  
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastResult, setLastResult] = useState<any>(null);
  const [showBOMModal, setShowBOMModal] = useState(false);
  const [showSourcingModal, setShowSourcingModal] = useState(false);
  const [showCircuitModal, setShowCircuitModal] = useState(false);
  const [safetyGateOverride, setSafetyGateOverride] = useState(
    process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_SAFETY_GATE_OVERRIDE === 'true'
  );

  // Web Worker state
  const [status, setStatus] = useState<"idle"|"starting"|"running"|"paused"|"cancelling"|"done"|"error">("idle");
  const [stages, setStages] = useState<any[]>([]);
  const [issues, setIssues] = useState<{erc:any[]; drc:any[]}>({ erc:[], drc:[] });
  const [layout, setLayout] = useState<{nodes:any[]; edges:any[]}>({ nodes:[], edges:[] });
  const workerRef = useRef<Worker|null>(null);

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  // Initialize worker
  useEffect(() => {
    // Use compatible worker loading for Next.js
    if (typeof Worker !== 'undefined') {
      try {
        const w = new Worker(new URL('../../workers/orchestration.worker.ts', import.meta.url));
        workerRef.current = w;
        
        w.onmessage = (evt) => {
          const msg = evt.data;
          if (msg.type === "status") setStatus(msg.status);
          if (msg.type === "stage:progress") {
            setStages(prev => {
              const others = prev.filter((s:any)=>s.stageId !== msg.stageId);
              return [...others, msg];
            });
          }
          if (msg.type === "ercdrc:update") setIssues(msg.issues);
          if (msg.type === "layout:ready") setLayout({ nodes: msg.nodes, edges: msg.edges });
          if (msg.type === "result") {
            setLastResult(msg.summary);
            // Refresh project data when complete
            fetchProject();
          }
          if (msg.type === "error") {
            console.error('Worker error:', msg.message);
            alert(`Orchestration error: ${msg.message}`);
          }
        };
      } catch (error) {
        console.error('Failed to load worker:', error);
      }
    }
    
    return () => { 
      if (workerRef.current) {
        workerRef.current.terminate(); 
        workerRef.current = null; 
      }
    };
  }, []);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data);
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    } finally {
      setLoading(false);
    }
  };

  // Worker control functions
  const startOrchestration = () => workerRef.current?.postMessage({ 
    type:"start", 
    projectId, 
    options:{ maxConcurrency: 3 }
  });
  
  const pauseOrchestration = () => workerRef.current?.postMessage({ type:"pause" });
  const resumeOrchestration = () => workerRef.current?.postMessage({ type:"resume" });
  const cancelOrchestration = () => workerRef.current?.postMessage({ type:"cancel" });

  // Legacy handler for CopilotPanel compatibility
  const handleRunOrchestration = async (mode: string, stage?: string) => {
    // For now, just start the full orchestration via worker
    startOrchestration();
  };

  const handleSaveCanvas = async (canvas: any) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasJson: canvas })
      });

      if (response.ok) {
        console.log('Canvas saved successfully');
      }
    } catch (error) {
      console.error('Failed to save canvas:', error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-lg">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Project not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-tyton-black border-b-4 border-tyton-gold px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-tyton-white">{project.title}</h1>
            <p className="text-sm text-tyton-gold mt-1">{project.description}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Orchestration Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={startOrchestration}
                disabled={status === "running" || status === "starting"}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                Run
              </button>
              <button
                onClick={pauseOrchestration}
                disabled={status !== "running"}
                className="flex items-center gap-2 px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
              <button
                onClick={resumeOrchestration}
                disabled={status !== "paused"}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
              <button
                onClick={cancelOrchestration}
                disabled={status === "done" || status === "idle"}
                className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Square className="w-4 h-4" />
                Cancel
              </button>
              <span className="text-sm text-tyton-gold font-medium">Status: {status}</span>
            </div>

            {project.status === 'safety_gate' && !safetyGateOverride && (
              <div className="flex items-center gap-2 px-3 py-2 bg-tyton-gold text-tyton-black rounded-md">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">Safety Gate Active</span>
              </div>
            )}
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={() => setSafetyGateOverride(!safetyGateOverride)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                  safetyGateOverride 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-tyton-gold text-tyton-black hover:bg-tyton-gold-light'
                }`}
                title={`Safety gate is ${safetyGateOverride ? 'overridden' : 'active'} - click to toggle`}
              >
                {safetyGateOverride ? (
                  <>
                    <ShieldOff className="w-4 h-4" />
                    <span className="text-sm font-medium">Override Active</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-medium">Safety Gate</span>
                  </>
                )}
              </button>
            )}
            {/* TYTON Logo */}
            <div className="text-3xl font-nasa font-bold tracking-wider text-tyton-gold">
              TYTON
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Copilot Panel - Left Side */}
        <div className="w-80 flex-shrink-0">
          <CopilotPanel
            projectId={projectId}
            onRunOrchestration={handleRunOrchestration}
            lastResult={lastResult}
            safetyGate={project.status === 'safety_gate'}
          />
        </div>

        {/* Canvas - Main Area */}
        <div className="flex-1">
          <ProjectCanvas
            projectId={projectId}
            modules={project.modules || []}
            connections={project.connections || []}
            onSaveCanvas={handleSaveCanvas}
            workerLayout={layout}
            orchestrationStages={stages}
            orchestrationIssues={issues}
          />
        </div>
      </div>

      {/* Footer Drawer for BOM/Sourcing/Circuit */}
      <div className="bg-tyton-black border-t-4 border-tyton-gold p-4">
        <div className="flex gap-4">
          <button
            onClick={() => setShowBOMModal(true)}
            className="flex-1 text-left hover:bg-tyton-gold hover:bg-opacity-10 rounded-lg p-2 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-tyton-gold" />
              <h3 className="text-sm font-semibold text-tyton-gold">
                BOM ({project.bomItems?.length || 0} items)
              </h3>
            </div>
            <div className="text-xs text-tyton-white">
              {project.bomItems?.length > 0 ? (
                <span>
                  Total: ${project.bomItems.reduce((sum: number, item: any) => 
                    sum + (item.extendedCost || 0), 0).toFixed(2)}
                </span>
              ) : (
                <span className="text-tyton-gold">No BOM items yet</span>
              )}
            </div>
          </button>
          <button
            onClick={() => setShowSourcingModal(true)}
            className="flex-1 text-left hover:bg-tyton-gold hover:bg-opacity-10 rounded-lg p-2 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="w-4 h-4 text-tyton-gold" />
              <h3 className="text-sm font-semibold text-tyton-gold">
                Sourcing ({project.suppliers?.length || 0} suppliers)
              </h3>
            </div>
            <div className="text-xs text-tyton-white">
              {project.suppliers?.length > 0 ? (
                <span>
                  {Array.from(new Set(project.suppliers.map((s: any) => s.supplier))).join(', ')}
                </span>
              ) : (
                <span className="text-tyton-gold">No sourcing info yet</span>
              )}
            </div>
          </button>
          <button
            onClick={() => setShowCircuitModal(true)}
            className="flex-1 text-left hover:bg-tyton-gold hover:bg-opacity-10 rounded-lg p-2 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-tyton-gold" />
              <h3 className="text-sm font-semibold text-tyton-gold">
                Circuit ({(project.modules || []).filter((m: any) => m.kind === 'schematic' || m.kind === 'wiring').length} modules)
              </h3>
            </div>
            <div className="text-xs text-tyton-white">
              {(project.modules || []).some((m: any) => m.kind === 'schematic') ? (
                <span>Schematic & wiring available</span>
              ) : (
                <span className="text-tyton-gold">No circuit diagram yet</span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* BOM Modal */}
      <BOMModal
        isOpen={showBOMModal}
        onClose={() => setShowBOMModal(false)}
        items={project.bomItems || []}
        projectTitle={project.title}
      />

      {/* Sourcing Modal */}
      <SourcingModal
        isOpen={showSourcingModal}
        onClose={() => setShowSourcingModal(false)}
        suppliers={project.suppliers || []}
        projectTitle={project.title}
      />

      {/* Circuit Modal */}
      <CircuitModal
        isOpen={showCircuitModal}
        onClose={() => setShowCircuitModal(false)}
        projectTitle={project.title}
        projectId={projectId}
        schematicModule={(project.modules || []).find((m: any) => m.kind === 'schematic')}
        wiringModule={(project.modules || []).find((m: any) => m.kind === 'wiring')}
        onRefresh={fetchProject}
      />
    </div>
  );
}