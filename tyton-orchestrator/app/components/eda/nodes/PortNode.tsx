"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface PortNodeData {
  portId: string;
  pinNumber?: string;
  pinType?: string;
  netName?: string;
  highlighted?: boolean;
}

const PortNode = memo(({ data }: NodeProps<PortNodeData>) => {
  const { pinNumber, pinType, netName, highlighted } = data;
  
  // Determine port color based on pin type
  const getPortColor = () => {
    switch (pinType) {
      case 'input':
        return 'bg-blue-500 border-blue-600';
      case 'output':
        return 'bg-green-500 border-green-600';
      case 'bidirectional':
        return 'bg-yellow-500 border-yellow-600';
      case 'power':
        return 'bg-red-500 border-red-600';
      case 'passive':
        return 'bg-gray-500 border-gray-600';
      default:
        return 'bg-gray-400 border-gray-500';
    }
  };

  const portColor = getPortColor();

  return (
    <div className="relative">
      {/* Main port circle */}
      <div 
        className={`
          w-4 h-4 rounded-full border-2 
          ${portColor} 
          ${highlighted ? 'ring-2 ring-yellow-400' : ''}
          shadow-sm transition-all duration-200
          hover:scale-110
        `}
        title={`Pin ${pinNumber} (${pinType}): ${netName || 'NC'}`}
      >
        {/* Connection handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-2 h-2 bg-transparent border-0"
          style={{ left: -4, top: 2 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          className="w-2 h-2 bg-transparent border-0"
          style={{ right: -4, top: 2 }}
        />
      </div>

      {/* Pin label */}
      {pinNumber && (
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-mono bg-white px-1 rounded shadow-sm whitespace-nowrap">
          {pinNumber}
        </div>
      )}

      {/* Net label (shown when highlighted) */}
      {highlighted && netName && netName !== 'NC' && (
        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs bg-yellow-200 px-1 rounded shadow-sm whitespace-nowrap">
          {netName}
        </div>
      )}
    </div>
  );
});

PortNode.displayName = 'PortNode';

export default PortNode;