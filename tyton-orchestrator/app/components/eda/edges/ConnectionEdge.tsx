"use client";

import { memo } from 'react';
import { EdgeProps, getStraightPath, getBezierPath } from 'reactflow';

interface ConnectionEdgeData {
  netName: string;
  sourcePin?: string;
  targetPin?: string;
  highlighted?: boolean;
}

const ConnectionEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style = {},
}: EdgeProps<ConnectionEdgeData>) => {
  const { netName, highlighted } = data || {};

  // Determine edge routing style
  const useOrthogonal = true; // Use orthogonal routing for cleaner schematic look
  
  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (useOrthogonal) {
    // Create orthogonal path (L-shaped or stepped)
    const midX = sourceX + (targetX - sourceX) / 2;
    
    // Check if we should route horizontally first or vertically first
    const deltaX = Math.abs(targetX - sourceX);
    const deltaY = Math.abs(targetY - sourceY);
    
    if (deltaX > deltaY) {
      // Route horizontally first
      edgePath = `M${sourceX},${sourceY} L${midX},${sourceY} L${midX},${targetY} L${targetX},${targetY}`;
    } else {
      // Route vertically first  
      const midY = sourceY + (targetY - sourceY) / 2;
      edgePath = `M${sourceX},${sourceY} L${sourceX},${midY} L${targetX},${midY} L${targetX},${targetY}`;
    }
    
    labelX = midX;
    labelY = sourceY + (targetY - sourceY) / 2;
  } else {
    // Use curved bezier path
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  // Determine edge styling
  const strokeColor = highlighted || selected ? '#ff6b6b' : '#64748b';
  const strokeWidth = highlighted || selected ? 3 : 2;
  const strokeDasharray = data?.netName === 'NC' ? '5,5' : undefined;

  return (
    <>
      {/* Main connection line */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
        }}
        markerEnd="url(#react-flow__arrowclosed)"
      />
      
      {/* Connection dots at endpoints */}
      <circle
        cx={sourceX}
        cy={sourceY}
        r="2"
        fill={strokeColor}
        className="react-flow__edge-source-dot"
      />
      <circle
        cx={targetX}
        cy={targetY}
        r="2"
        fill={strokeColor}
        className="react-flow__edge-target-dot"
      />

      {/* Net name label (shown when highlighted or selected) */}
      {(highlighted || selected) && netName && netName !== 'Unknown' && (
        <g>
          {/* Label background */}
          <rect
            x={labelX - netName.length * 3}
            y={labelY - 8}
            width={netName.length * 6}
            height={16}
            fill="white"
            stroke="#64748b"
            strokeWidth="1"
            rx="3"
            className="react-flow__edge-label-bg"
          />
          {/* Label text */}
          <text
            x={labelX}
            y={labelY + 3}
            textAnchor="middle"
            fontSize="12"
            fill="#374151"
            className="react-flow__edge-label-text font-mono"
          >
            {netName}
          </text>
        </g>
      )}

      {/* Connection indicators for debugging */}
      {process.env.NODE_ENV === 'development' && selected && (
        <g className="debug-info">
          <text
            x={sourceX + 5}
            y={sourceY - 5}
            fontSize="10"
            fill="#6b7280"
            className="font-mono"
          >
            {data?.sourcePin || 'src'}
          </text>
          <text
            x={targetX + 5}
            y={targetY - 5}
            fontSize="10"
            fill="#6b7280"
            className="font-mono"
          >
            {data?.targetPin || 'tgt'}
          </text>
        </g>
      )}
    </>
  );
});

ConnectionEdge.displayName = 'ConnectionEdge';

export default ConnectionEdge;