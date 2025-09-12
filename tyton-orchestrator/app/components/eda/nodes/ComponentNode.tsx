"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface ComponentNodeData {
  component: {
    ref: string;
    value?: string;
    footprint?: string;
    role?: string;
    mpn?: string;
    pins?: Array<{
      number?: string | number;
      name?: string;
      net?: string;
      type?: string;
    }>;
    attributes?: Record<string, any>;
  };
  selected?: boolean;
  highlighted?: boolean;
}

const ComponentNode = memo(({ data, selected }: NodeProps<ComponentNodeData>) => {
  const { component } = data;
  
  // Determine component icon based on role or footprint
  const getComponentIcon = () => {
    const role = component.role?.toLowerCase() || '';
    const footprint = component.footprint?.toLowerCase() || '';
    const ref = component.ref.toLowerCase();
    
    if (role.includes('resistor') || ref.startsWith('r')) {
      return '⟨⟩';
    } else if (role.includes('capacitor') || ref.startsWith('c')) {
      return '||';
    } else if (role.includes('led') || ref.startsWith('led')) {
      return '💡';
    } else if (role.includes('mcu') || role.includes('processor') || ref.startsWith('u')) {
      return '🔲';
    } else if (role.includes('connector') || ref.startsWith('j')) {
      return '🔌';
    } else if (role.includes('inductor') || ref.startsWith('l')) {
      return '∿∿';
    } else if (role.includes('diode') || ref.startsWith('d')) {
      return '▷|';
    } else if (role.includes('transistor') || ref.startsWith('q')) {
      return '◣◢';
    } else if (role.includes('crystal') || role.includes('oscillator')) {
      return '◊';
    } else if (role.includes('switch') || role.includes('button')) {
      return '⟧⟦';
    } else if (footprint.includes('soic') || footprint.includes('qfn')) {
      return '▢';
    }
    
    return '□';
  };

  // Determine component color based on type
  const getComponentColor = () => {
    const role = component.role?.toLowerCase() || '';
    const ref = component.ref.toLowerCase();
    
    if (role.includes('resistor') || ref.startsWith('r')) {
      return { bg: 'bg-yellow-100', border: 'border-yellow-400', text: 'text-yellow-800' };
    } else if (role.includes('capacitor') || ref.startsWith('c')) {
      return { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800' };
    } else if (role.includes('mcu') || role.includes('processor') || ref.startsWith('u')) {
      return { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800' };
    } else if (role.includes('led') || ref.startsWith('led')) {
      return { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800' };
    } else if (role.includes('connector') || ref.startsWith('j')) {
      return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-800' };
    } else if (role.includes('sensor')) {
      return { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-800' };
    } else if (role.includes('regulator') || role.includes('power')) {
      return { bg: 'bg-red-100', border: 'border-red-400', text: 'text-red-800' };
    }
    
    return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-800' };
  };

  // Calculate pin positions and create handles
  const createPinHandles = () => {
    if (!component.pins || component.pins.length === 0) {
      // Default input/output handles for components without explicit pins
      return (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="default-input"
            className="w-2 h-2 bg-blue-500 border-2 border-white"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="default-output"
            className="w-2 h-2 bg-red-500 border-2 border-white"
          />
        </>
      );
    }

    return component.pins.map((pin, index) => {
      const pinId = `pin_${pin.number || pin.name || index}`;
      const isInput = pin.type === 'input';
      const isPower = pin.type === 'power';
      const pinNumber = pin.number || index + 1;
      
      // Determine pin position based on pin number and component type
      let position = Position.Left;
      let style = { top: `${(index + 1) * (100 / (component.pins!.length + 1))}%` };
      
      const footprint = component.footprint?.toLowerCase() || '';
      
      if (footprint.includes('dip')) {
        // DIP package: pins 1-N/2 on left, rest on right
        const halfPinCount = Math.ceil(component.pins!.length / 2);
        if (typeof pinNumber === 'number' && pinNumber <= halfPinCount) {
          position = Position.Left;
          style = { top: `${((pinNumber - 1) * 100) / (halfPinCount - 1)}%` };
        } else {
          position = Position.Right;
          const rightPinIndex = typeof pinNumber === 'number' ? pinNumber - halfPinCount - 1 : index - halfPinCount;
          style = { top: `${(rightPinIndex * 100) / (halfPinCount - 1)}%` };
        }
      } else if (footprint.includes('soic')) {
        // SOIC package: similar to DIP
        const halfPinCount = Math.ceil(component.pins!.length / 2);
        if (index < halfPinCount) {
          position = Position.Left;
          style = { top: `${(index * 100) / (halfPinCount - 1)}%` };
        } else {
          position = Position.Right;
          style = { top: `${((component.pins!.length - 1 - index) * 100) / (halfPinCount - 1)}%` };
        }
      } else if (footprint.includes('qfn') || footprint.includes('qfp')) {
        // QFN/QFP: distribute around perimeter
        const pinsPerSide = Math.ceil(component.pins!.length / 4);
        const sideIndex = Math.floor(index / pinsPerSide);
        const posOnSide = index % pinsPerSide;
        
        switch (sideIndex) {
          case 0: // Left
            position = Position.Left;
            style = { top: `${(posOnSide * 100) / (pinsPerSide - 1)}%` };
            break;
          case 1: // Bottom
            position = Position.Bottom;
            style = { left: `${(posOnSide * 100) / (pinsPerSide - 1)}%` };
            break;
          case 2: // Right
            position = Position.Right;
            style = { top: `${((pinsPerSide - 1 - posOnSide) * 100) / (pinsPerSide - 1)}%` };
            break;
          case 3: // Top
            position = Position.Top;
            style = { left: `${((pinsPerSide - 1 - posOnSide) * 100) / (pinsPerSide - 1)}%` };
            break;
        }
      } else {
        // Default: alternate sides based on pin type
        if (isInput) {
          position = Position.Left;
        } else if (isPower) {
          position = Position.Top;
        } else {
          position = Position.Right;
        }
      }

      const pinColor = isPower ? 'bg-red-500' : isInput ? 'bg-blue-500' : 'bg-green-500';
      
      return (
        <Handle
          key={pinId}
          type={isInput ? "target" : "source"}
          position={position}
          id={pinId}
          style={style}
          className={`w-2 h-2 ${pinColor} border-2 border-white`}
          title={`${pinId}: ${pin.name || ''} (${pin.net || 'NC'})`}
        />
      );
    });
  };

  const colors = getComponentColor();
  const icon = getComponentIcon();

  return (
    <div 
      className={`
        ${colors.bg} ${colors.border} ${colors.text}
        border-2 rounded-lg p-2 shadow-sm min-w-16 min-h-10 
        transition-all duration-200
        ${selected ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}
        ${data.highlighted ? 'ring-2 ring-yellow-400' : ''}
        hover:shadow-md
      `}
    >
      {createPinHandles()}
      
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-lg leading-none">{icon}</div>
        <div className="font-bold text-xs mt-1">{component.ref}</div>
        {component.value && (
          <div className="text-xs opacity-75 leading-tight">{component.value}</div>
        )}
        
        {/* Show additional info on hover or selection */}
        {(selected || data.highlighted) && (
          <div className="absolute z-10 top-full left-0 mt-1 p-2 bg-white border border-gray-300 rounded shadow-lg text-xs whitespace-nowrap">
            <div><strong>Ref:</strong> {component.ref}</div>
            {component.value && <div><strong>Value:</strong> {component.value}</div>}
            {component.footprint && <div><strong>Footprint:</strong> {component.footprint}</div>}
            {component.role && <div><strong>Role:</strong> {component.role}</div>}
            {component.mpn && <div><strong>MPN:</strong> {component.mpn}</div>}
            {component.pins && <div><strong>Pins:</strong> {component.pins.length}</div>}
          </div>
        )}
      </div>
    </div>
  );
});

ComponentNode.displayName = 'ComponentNode';

export default ComponentNode;