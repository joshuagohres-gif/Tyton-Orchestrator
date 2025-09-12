'use client';

import React, { useCallback, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import ElectronicsNode from './nodes/ElectronicsNode';
import MechanicalNode from './nodes/MechanicalNode';
import BOMNode from './nodes/BOMNode';
import SourcingNode from './nodes/SourcingNode';
import { Button } from '@/components/ui/Button';
import { Plus, Save } from 'lucide-react';

const nodeTypes = {
  electronics: ElectronicsNode,
  mechanical: MechanicalNode,
  bom: BOMNode,
  sourcing: SourcingNode,
};

interface ProjectCanvasProps {
  projectId: string;
  modules: any[];
  connections: any[];
  onSaveCanvas: (canvas: any) => void;
  workerLayout?: any;
  orchestrationStages?: any[];
  orchestrationIssues?: any[];
}

function ProjectCanvasInner({ 
  projectId, 
  modules, 
  connections, 
  onSaveCanvas, 
  workerLayout, 
  orchestrationStages, 
  orchestrationIssues 
}: ProjectCanvasProps) {
  const reactFlowInstance = useReactFlow();
  
  // Module handlers
  const handleModuleUpdate = useCallback(async (moduleId: string, updates: any) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/modules/${moduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: updates.title,
          meta: updates.meta
        })
      });
      
      if (response.ok) {
        // Update local state
        setNodes(prevNodes => 
          prevNodes.map(node => 
            node.id === moduleId 
              ? { ...node, data: { ...node.data, ...updates } }
              : node
          )
        );
      }
    } catch (error) {
      console.error('Failed to update module:', error);
    }
  }, [projectId]);
  
  const handleModuleDelete = useCallback(async (moduleId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/modules/${moduleId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Remove from local state
        setNodes(prevNodes => prevNodes.filter(node => node.id !== moduleId));
        setEdges(prevEdges => 
          prevEdges.filter(edge => 
            edge.source !== moduleId && edge.target !== moduleId
          )
        );
      }
    } catch (error) {
      console.error('Failed to delete module:', error);
    }
  }, [projectId]);
  
  const handleModuleCreate = useCallback(async (kind: string, label: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          label,
          meta: {}
        })
      });
      
      if (response.ok) {
        const newModule = await response.json();
        
        // Add to local state
        const newNode: Node = {
          id: newModule.id,
          type: newModule.kind,
          position: { 
            x: Math.random() * 400 + 100,
            y: Math.random() * 400 + 100
          },
          data: {
            ...newModule,
            onUpdate: (updates: any) => handleModuleUpdate(newModule.id, updates),
            onDelete: () => handleModuleDelete(newModule.id)
          }
        };
        
        setNodes(prevNodes => [...prevNodes, newNode]);
      }
    } catch (error) {
      console.error('Failed to create module:', error);
    }
  }, [projectId, handleModuleUpdate, handleModuleDelete]);
  
  // Convert modules to nodes
  const initialNodes: Node[] = modules.map((module, index) => ({
    id: module.id,
    type: module.kind,
    position: { 
      x: (index % 4) * 250 + 50, 
      y: Math.floor(index / 4) * 200 + 50 
    },
    data: {
      ...module,
      onUpdate: (updates: any) => handleModuleUpdate(module.id, updates),
      onDelete: () => handleModuleDelete(module.id)
    },
  }));

  // Convert connections to edges
  const initialEdges: Edge[] = connections.map((conn) => ({
    id: conn.id,
    source: conn.fromModuleId,
    target: conn.toModuleId,
    label: conn.label,
    type: conn.type === 'wiring' ? 'default' : 'step',
    animated: conn.type === 'wiring',
    style: {
      stroke: conn.type === 'wiring' ? 'var(--accent)' : 'var(--muted)',
      strokeWidth: 2,
    },
  }));

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newModuleKind, setNewModuleKind] = useState<string>('electronics');
  const [newModuleLabel, setNewModuleLabel] = useState<string>('');

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  const handleSave = useCallback(() => {
    if (reactFlowInstance) {
      const flow = reactFlowInstance.toObject();
      onSaveCanvas(flow);
    }
  }, [reactFlowInstance, onSaveCanvas]);
  
  const handleCreateSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (newModuleLabel.trim()) {
      await handleModuleCreate(newModuleKind, newModuleLabel.trim());
      setNewModuleLabel('');
      setShowCreateModal(false);
    }
  }, [newModuleKind, newModuleLabel, handleModuleCreate]);

  return (
    <div className="h-full relative bg-bg border border-border rounded-xl overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-bg"
      >
        <Controls className="[&>button]:bg-surface [&>button]:border-border [&>button]:text-text [&>button:hover]:border-accent [&>button:hover]:text-accent" />
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={16} 
          size={1} 
          color="var(--accent)" 
          bgColor="var(--bg)"
        />
      </ReactFlow>
      
      {/* Action Buttons */}
      <div className="absolute top-4 right-4 flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowCreateModal(true)}
          className="shadow-glow"
        >
          <Plus className="w-4 h-4" />
          Add Module
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
        >
          <Save className="w-4 h-4" />
          Save Canvas
        </Button>
      </div>
      
      {/* Create Module Modal */}
      {showCreateModal && (
        <div className="absolute inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface border border-accent rounded-xl p-6 w-96 shadow-glow animate-in fade-in-0 zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold mb-4 text-text">Create New Module</h3>
            <form onSubmit={handleCreateSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-text mb-2">
                  Module Type
                </label>
                <select
                  value={newModuleKind}
                  onChange={(e) => setNewModuleKind(e.target.value)}
                  className="w-full px-4 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text transition-colors"
                >
                  <option value="electronics">Electronics</option>
                  <option value="mechanical">Mechanical</option>
                  <option value="bom">Bill of Materials</option>
                  <option value="sourcing">Sourcing</option>
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-text mb-2">
                  Module Name
                </label>
                <input
                  type="text"
                  value={newModuleLabel}
                  onChange={(e) => setNewModuleLabel(e.target.value)}
                  className="w-full px-4 py-2 bg-bg border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-text placeholder-muted transition-colors"
                  placeholder="Enter module name"
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewModuleLabel('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!newModuleLabel.trim()}
                  className="shadow-glow"
                >
                  Create Module
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectCanvas(props: ProjectCanvasProps) {
  return (
    <ReactFlowProvider>
      <ProjectCanvasInner {...props} />
    </ReactFlowProvider>
  );
}