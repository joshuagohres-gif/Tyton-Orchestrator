'use client';

import React, { useCallback, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/Button';
import { Save } from 'lucide-react';

interface SchematicDiagramProps {
  nodes: any[];
  edges: any[];
  onSaveLayout?: (nodes: Node[], edges: Edge[]) => void;
}

const ComponentNode = ({ data }: { data: any }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  // Color by component group
  const getNodeColor = (group: string) => {
    switch (group) {
      case 'Power': return '#dc2626'; // red
      case 'MCU': return '#2563eb'; // blue
      case 'Protections': return '#ca8a04'; // yellow
      case 'Buses': return '#16a34a'; // green
      case 'Peripherals': return '#7c3aed'; // purple
      case 'Connectors': return '#ea580c'; // orange
      case 'TestPoints': return '#0891b2'; // cyan
      default: return '#6b7280'; // gray
    }
  };

  const nodeColor = getNodeColor(data.group || 'Peripherals');

  return (
    <div 
      className="px-3 py-2 border-2 rounded-lg bg-surface text-text text-sm min-w-[120px] shadow-sm transition-all duration-200"
      style={{ 
        borderColor: nodeColor,
        backgroundColor: isHovered ? `${nodeColor}15` : 'var(--surface)',
        boxShadow: isHovered ? `0 0 12px ${nodeColor}20` : undefined
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="font-bold text-center text-text">{data.ref}</div>
      <div className="text-xs text-center text-muted">{data.mpn}</div>
      {isHovered && data.pins && data.pins.length > 0 && (
        <div className="absolute z-10 bg-surface border border-accent rounded-lg p-3 mt-1 text-xs max-w-xs shadow-glow">
          <div className="font-semibold mb-1 text-accent">Pins:</div>
          {data.pins.slice(0, 8).map((pin: any, idx: number) => (
            <div key={idx} className="truncate text-text">
              {pin.num}: {pin.name} ({pin.dir})
            </div>
          ))}
          {data.pins.length > 8 && <div className="text-muted">... and {data.pins.length - 8} more</div>}
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  component: ComponentNode,
  connector: ComponentNode,
  testpoint: ComponentNode,
};

export default function SchematicDiagram({ nodes, edges, onSaveLayout }: SchematicDiagramProps) {
  // Convert layout nodes/edges to React Flow format
  const initialNodes: Node[] = nodes.map(node => ({
    id: node.id,
    type: node.type || 'component',
    position: { x: node.x, y: node.y },
    data: node.data || { 
      ref: node.id, 
      mpn: node.label || '', 
      group: node.group,
      ...node.data 
    },
  }));

  const initialEdges: Edge[] = edges.map((edge, idx) => ({
    id: edge.id || `edge-${idx}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: 'default',
    animated: edge.type === 'power',
    style: {
      stroke: edge.type === 'power' ? '#dc2626' : 
             edge.type === 'bus' ? '#16a34a' : '#6b7280',
      strokeWidth: edge.type === 'power' ? 3 : 2,
      strokeDasharray: edge.type === 'bus' ? '5,5' : undefined,
    },
  }));

  const [reactFlowNodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [reactFlowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleSaveLayout = useCallback(() => {
    if (onSaveLayout) {
      onSaveLayout(reactFlowNodes, reactFlowEdges);
    }
  }, [reactFlowNodes, reactFlowEdges, onSaveLayout]);

  return (
    <div className="w-full h-[600px] bg-bg border border-border rounded-xl overflow-hidden">
      <ReactFlow
        nodes={reactFlowNodes}
        edges={reactFlowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-bg"
      >
        <Controls className="[&>button]:bg-surface [&>button]:border-border [&>button]:text-text [&>button:hover]:border-accent [&>button:hover]:text-accent" />
        <MiniMap 
          className="bg-surface border border-border rounded-lg"
          maskColor="var(--bg)" 
          nodeColor={(node) => {
            const group = node.data?.group || 'Peripherals';
            switch (group) {
              case 'Power': return '#dc2626';
              case 'MCU': return '#2563eb';
              case 'Protections': return '#ca8a04';
              case 'Buses': return '#16a34a';
              case 'Peripherals': return '#7c3aed';
              case 'Connectors': return '#ea580c';
              case 'TestPoints': return '#0891b2';
              default: return '#6b7280';
            }
          }}
        />
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          size={1} 
          color="var(--accent)"
          bgColor="var(--bg)"
        />
      </ReactFlow>
      
      {onSaveLayout && (
        <div className="p-3 border-t border-border bg-surface">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveLayout}
            className="shadow-glow"
          >
            <Save className="w-4 h-4" />
            Save Layout
          </Button>
        </div>
      )}
    </div>
  );
}