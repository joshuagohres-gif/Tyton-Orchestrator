"use client";

import { memo } from 'react';
import { EdgeProps, getBezierPath } from 'reactflow';

interface NetLabelEdgeData {
  netName: string;
  highlighted?: boolean;
}

const NetLabelEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<NetLabelEdgeData>) => {
  const { netName, highlighted } = data || {};

  if (!netName) return null;

  // Get the path to find midpoint for label placement
  const [, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Calculate label dimensions
  const labelPadding = 4;
  const charWidth = 6;
  const labelWidth = netName.length * charWidth + labelPadding * 2;
  const labelHeight = 20;

  return (
    <g className={`net-label ${highlighted ? 'highlighted' : ''}`}>
      {/* Label background */}
      <rect
        x={labelX - labelWidth / 2}
        y={labelY - labelHeight / 2}
        width={labelWidth}
        height={labelHeight}
        fill={highlighted ? '#fef3c7' : '#ffffff'}
        stroke={highlighted ? '#f59e0b' : '#d1d5db'}
        strokeWidth="1"
        rx="6"
        ry="6"
        className="drop-shadow-sm"
      />
      
      {/* Label text */}
      <text
        x={labelX}
        y={labelY + 3}
        textAnchor="middle"
        fontSize="11"
        fontWeight="500"
        fill={highlighted ? '#92400e' : '#4b5563'}
        className="font-mono select-none pointer-events-none"
      >
        {netName}
      </text>

      {/* Optional connection indicator dot */}
      <circle
        cx={labelX}
        cy={labelY}
        r="2"
        fill={highlighted ? '#f59e0b' : '#9ca3af'}
        className="opacity-50"
      />

      {/* Hover effect (invisible larger area for easier interaction) */}
      <rect
        x={labelX - labelWidth / 2 - 5}
        y={labelY - labelHeight / 2 - 5}
        width={labelWidth + 10}
        height={labelHeight + 10}
        fill="transparent"
        className="cursor-pointer"
        style={{ pointerEvents: 'all' }}
      />
    </g>
  );
});

NetLabelEdge.displayName = 'NetLabelEdge';

export default NetLabelEdge;