"use client";

import { useCallback, useEffect, useState, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  NodeTypes,
  EdgeTypes,
  Connection,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import ComponentNode from './nodes/ComponentNode';
import PortNode from './nodes/PortNode';
import ConnectionEdge from './edges/ConnectionEdge';
import NetLabelEdge from './edges/NetLabelEdge';

import type { EdaSpecV1 } from '@/server/eda/specs/edaSpecV10';
import type { LayoutResult } from '@/server/eda/layout/elk';

interface CircuitPanelProps {
  eda: EdaSpecV1;
  layout?: LayoutResult;
  onComponentSelect?: (componentRef: string) => void;
  onNetSelect?: (netName: string) => void;
  onLayoutChange?: (layout: LayoutResult) => void;
  readonly?: boolean;
  className?: string;
}

interface CircuitNode extends Node {
  data: {
    component?: any;
    portId?: string;
    netName?: string;
    pinNumber?: string;
    pinType?: string;
    selected?: boolean;
    highlighted?: boolean;
  };
}

interface CircuitEdge extends Edge {
  data: {
    netName: string;
    sourcePin?: string;
    targetPin?: string;
    highlighted?: boolean;
  };
}

const nodeTypes: NodeTypes = {
  component: ComponentNode,
  port: PortNode,
};

const edgeTypes: EdgeTypes = {
  connection: ConnectionEdge,
  netlabel: NetLabelEdge,
};

function CircuitPanelInner({
  eda,
  layout,
  onComponentSelect,
  onNetSelect,
  onLayoutChange,
  readonly = false,
  className = "",
}: CircuitPanelProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [selectedNet, setSelectedNet] = useState<string | null>(null);
  const [showPinLabels, setShowPinLabels] = useState(true);
  const [showNetLabels, setShowNetLabels] = useState(true);
  const [viewMode, setViewMode] = useState<'schematic' | 'netlist'>('schematic');

  const { fitView } = useReactFlow();

  // Convert EDA spec and layout to ReactFlow nodes and edges
  const convertToReactFlow = useCallback(() => {
    const reactFlowNodes: CircuitNode[] = [];
    const reactFlowEdges: CircuitEdge[] = [];

    if (!layout) return { nodes: reactFlowNodes, edges: reactFlowEdges };

    // Create component nodes
    for (const component of layout.components) {
      const edaComponent = eda.components.find(c => c.ref === component.ref);
      if (!edaComponent) continue;

      const node: CircuitNode = {
        id: component.ref,
        type: 'component',
        position: { x: component.x, y: component.y },
        data: {
          component: edaComponent,
          selected: selectedComponent === component.ref,
          highlighted: false,
        },
        style: {
          width: component.width,
          height: component.height,
        },
        draggable: !readonly,
        selectable: true,
      };

      reactFlowNodes.push(node);

      // Create port nodes if showing pin details
      if (showPinLabels && viewMode === 'schematic') {
        for (const port of component.ports) {
          const pin = edaComponent.pins?.find(p => 
            `${component.ref}_pin_${p.number || p.name}` === port.id
          );

          if (pin) {
            const portNode: CircuitNode = {
              id: port.id,
              type: 'port',
              position: { x: port.x, y: port.y },
              data: {
                portId: port.id,
                pinNumber: pin.number?.toString() || pin.name,
                pinType: pin.type,
                netName: pin.net,
                highlighted: selectedNet === pin.net,
              },
              style: {
                width: 16,
                height: 16,
              },
              draggable: false,
              selectable: true,
              parentNode: component.ref,
              extent: 'parent',
            };

            reactFlowNodes.push(portNode);
          }
        }
      }
    }

    // Create edges from layout
    for (const edge of layout.edges) {
      const sourceComponent = layout.components.find(c => c.ref === edge.source);
      const targetComponent = layout.components.find(c => c.ref === edge.target);
      
      if (!sourceComponent || !targetComponent) continue;

      // Find net name from components
      const sourceComp = eda.components.find(c => c.ref === edge.source);
      const targetComp = eda.components.find(c => c.ref === edge.target);
      
      let netName = 'Unknown';
      if (sourceComp?.pins && targetComp?.pins) {
        // Find common net between source and target components
        for (const sourcePin of sourceComp.pins) {
          for (const targetPin of targetComp.pins) {
            if (sourcePin.net && sourcePin.net === targetPin.net && sourcePin.net !== 'NC') {
              netName = sourcePin.net;
              break;
            }
          }
          if (netName !== 'Unknown') break;
        }
      }

      const reactFlowEdge: CircuitEdge = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'connection',
        animated: selectedNet === netName,
        style: {
          stroke: selectedNet === netName ? '#ff6b6b' : '#64748b',
          strokeWidth: selectedNet === netName ? 3 : 2,
        },
        data: {
          netName,
          highlighted: selectedNet === netName,
        },
        markerEnd: {
          type: 'arrowclosed',
          color: selectedNet === netName ? '#ff6b6b' : '#64748b',
        },
      };

      // Add waypoints if available
      if (edge.points && edge.points.length > 2) {
        // Convert points to ReactFlow waypoints format
        const waypoints = edge.points.slice(1, -1).map(point => ({ x: point.x, y: point.y }));
        // Note: ReactFlow doesn't directly support waypoints, would need custom edge implementation
      }

      reactFlowEdges.push(reactFlowEdge);

      // Add net label if enabled
      if (showNetLabels && netName !== 'Unknown') {
        const midIndex = Math.floor(edge.points.length / 2);
        const midPoint = edge.points[midIndex];
        
        const labelEdge: CircuitEdge = {
          id: `${edge.id}_label`,
          source: edge.source,
          target: edge.target,
          type: 'netlabel',
          selectable: false,
          data: {
            netName,
            highlighted: selectedNet === netName,
          },
          style: {
            opacity: 0.8,
          },
        };

        reactFlowEdges.push(labelEdge);
      }
    }

    return { nodes: reactFlowNodes, edges: reactFlowEdges };
  }, [eda, layout, selectedComponent, selectedNet, showPinLabels, showNetLabels, viewMode, readonly]);

  // Update nodes and edges when EDA spec or layout changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = convertToReactFlow();
    setNodes(newNodes);
    setEdges(newEdges);
  }, [convertToReactFlow, setNodes, setEdges]);

  // Handle node selection
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const circuitNode = node as CircuitNode;
    
    if (circuitNode.type === 'component') {
      setSelectedComponent(circuitNode.id);
      onComponentSelect?.(circuitNode.id);
    } else if (circuitNode.type === 'port' && circuitNode.data.netName) {
      setSelectedNet(circuitNode.data.netName);
      onNetSelect?.(circuitNode.data.netName);
    }
  }, [onComponentSelect, onNetSelect]);

  // Handle edge selection
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    const circuitEdge = edge as CircuitEdge;
    if (circuitEdge.data.netName) {
      setSelectedNet(circuitEdge.data.netName);
      onNetSelect?.(circuitEdge.data.netName);
    }
  }, [onNetSelect]);

  // Handle connection creation (if not readonly)
  const onConnect = useCallback((connection: Connection) => {
    if (readonly) return;
    
    const newEdge: CircuitEdge = {
      ...connection,
      id: `${connection.source}-${connection.target}-${Date.now()}`,
      type: 'connection',
      data: {
        netName: 'New Net',
      },
    } as CircuitEdge;

    setEdges((eds) => addEdge(newEdge, eds));
  }, [readonly, setEdges]);

  // Handle node drag (update layout)
  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    if (readonly || !layout || !onLayoutChange) return;

    const updatedLayout = { ...layout };
    const componentIndex = updatedLayout.components.findIndex(c => c.ref === node.id);
    
    if (componentIndex !== -1) {
      updatedLayout.components[componentIndex] = {
        ...updatedLayout.components[componentIndex],
        x: node.position.x,
        y: node.position.y,
      };
      
      onLayoutChange(updatedLayout);
    }
  }, [readonly, layout, onLayoutChange]);

  // Pan to component
  const panToComponent = useCallback((componentRef: string) => {
    const node = nodes.find(n => n.id === componentRef);
    if (node) {
      fitView({ nodes: [node], duration: 800, padding: 0.3 });
    }
  }, [nodes, fitView]);

  // Highlight net
  const highlightNet = useCallback((netName: string) => {
    setSelectedNet(netName);
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedComponent(null);
    setSelectedNet(null);
  }, []);

  // Export current view
  const exportView = useCallback(() => {
    // This would export the current view as SVG or image
    console.log('Export view');
  }, []);

  // Fit to view
  const handleFitView = useCallback(() => {
    fitView({ duration: 800 });
  }, [fitView]);

  const miniMapNodeColor = useCallback((node: Node) => {
    const circuitNode = node as CircuitNode;
    if (circuitNode.data.selected) return '#ff6b6b';
    if (circuitNode.type === 'component') return '#3b82f6';
    return '#64748b';
  }, []);

  return (
    <div className={`w-full h-full relative ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-left"
        className="bg-gray-50"
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          size={1} 
          color="#e2e8f0"
        />
        
        <Controls 
          className="bg-white border border-gray-200 rounded-lg shadow-sm"
          showInteractive={false}
        />
        
        <MiniMap 
          nodeColor={miniMapNodeColor}
          className="bg-white border border-gray-200 rounded-lg"
          pannable
          zoomable
        />

        {/* Control Panel */}
        <Panel position="top-left" className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode(viewMode === 'schematic' ? 'netlist' : 'schematic')}
                className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                {viewMode === 'schematic' ? 'Netlist View' : 'Schematic View'}
              </button>
              <button
                onClick={handleFitView}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Fit View
              </button>
            </div>

            <div className="flex gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showPinLabels}
                  onChange={(e) => setShowPinLabels(e.target.checked)}
                  className="rounded"
                />
                Pin Labels
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showNetLabels}
                  onChange={(e) => setShowNetLabels(e.target.checked)}
                  className="rounded"
                />
                Net Labels
              </label>
            </div>

            {selectedComponent && (
              <div className="text-sm">
                <div className="font-medium text-blue-600">Selected: {selectedComponent}</div>
                <button
                  onClick={() => panToComponent(selectedComponent)}
                  className="text-blue-500 hover:text-blue-700 underline"
                >
                  Pan to Component
                </button>
              </div>
            )}

            {selectedNet && (
              <div className="text-sm">
                <div className="font-medium text-green-600">Net: {selectedNet}</div>
                <button
                  onClick={clearSelection}
                  className="text-gray-500 hover:text-gray-700 underline"
                >
                  Clear Selection
                </button>
              </div>
            )}
          </div>
        </Panel>

        {/* Statistics Panel */}
        <Panel position="top-right" className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div className="text-sm space-y-1">
            <div><span className="font-medium">Components:</span> {eda.components.length}</div>
            <div><span className="font-medium">Nets:</span> {edges.filter(e => e.type === 'connection').length}</div>
            {layout && (
              <>
                <div><span className="font-medium">Size:</span> {Math.round(layout.width)}×{Math.round(layout.height)}</div>
                <div><span className="font-medium">Density:</span> {(eda.components.length / (layout.width * layout.height) * 10000).toFixed(1)}/10k</div>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function CircuitPanel(props: CircuitPanelProps) {
  return (
    <ReactFlowProvider>
      <CircuitPanelInner {...props} />
    </ReactFlowProvider>
  );
}

// Helper functions for external use
export const circuitPanelHelpers = {
  convertEdaToNodes: (eda: EdaSpecV1, layout: LayoutResult) => {
    // Implementation would be here
    return [];
  },
  
  convertEdaToEdges: (eda: EdaSpecV1, layout: LayoutResult) => {
    // Implementation would be here
    return [];
  },
  
  exportAsSvg: (reactFlowInstance: any) => {
    // SVG export implementation
    return '';
  },
  
  exportAsPng: (reactFlowInstance: any) => {
    // PNG export implementation
    return '';
  },
};