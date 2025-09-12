'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Send, Cpu, Zap, Wrench, Code, Package, ShoppingCart, AlertTriangle } from 'lucide-react';

interface CopilotPanelProps {
  projectId: string;
  onRunOrchestration: (mode: string, stage?: string) => Promise<void>;
  lastResult?: any;
  safetyGate?: boolean;
}

export default function CopilotPanel({ 
  projectId, 
  onRunOrchestration, 
  lastResult,
  safetyGate 
}: CopilotPanelProps) {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeStage, setActiveStage] = useState<string | null>(null);

  const stages = [
    { id: 'components', label: 'Components', icon: Cpu },
    { id: 'wiring', label: 'Wiring', icon: Zap },
    { id: 'mechanical', label: 'Mechanical', icon: Wrench },
    { id: 'firmware', label: 'Firmware', icon: Code },
    { id: 'bom', label: 'BOM', icon: Package },
    { id: 'sourcing', label: 'Sourcing', icon: ShoppingCart },
  ];

  const handleRunMeta = async () => {
    setIsLoading(true);
    setActiveStage('meta');
    try {
      await onRunOrchestration('meta');
    } finally {
      setIsLoading(false);
      setActiveStage(null);
    }
  };

  const handleRunStage = async (stage: string) => {
    setIsLoading(true);
    setActiveStage(stage);
    try {
      await onRunOrchestration('stage', stage);
    } finally {
      setIsLoading(false);
      setActiveStage(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-tyton-gray-warm border-r-4 border-tyton-gold">
      <div className="p-4 border-b-2 border-tyton-gold bg-tyton-black">
        <h2 className="text-lg font-semibold text-tyton-gold">Copilot</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Project Description Input */}
          <div>
            <label className="block text-sm font-medium text-tyton-black mb-2">
              Project Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-32 px-3 py-2 border-2 border-tyton-gold rounded-md focus:outline-none focus:border-tyton-gold-light bg-tyton-white text-black"
              placeholder="Describe your hardware project..."
            />
          </div>

          {/* Run Meta Button */}
          <button
            onClick={handleRunMeta}
            disabled={isLoading || !description}
            className={cn(
              "w-full py-2 px-4 rounded-md font-medium transition-colors",
              "bg-tyton-gold text-tyton-black hover:bg-tyton-gold-light",
              "disabled:bg-gray-300 disabled:cursor-not-allowed",
              "flex items-center justify-center gap-2"
            )}
          >
            <Send className="w-4 h-4" />
            {activeStage === 'meta' ? 'Running Meta Analysis...' : 'Run Meta Analysis'}
          </button>

          {/* Safety Gate Warning */}
          {safetyGate && (
            <div className="p-3 bg-tyton-gold border-2 border-tyton-gold-dark rounded-md">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-tyton-black" />
                <p className="text-sm font-medium text-tyton-black">
                  Safety Gate: Professional oversight recommended
                </p>
              </div>
            </div>
          )}

          {/* Stage Buttons */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-tyton-black">Individual Stages</h3>
            <div className="grid grid-cols-2 gap-2">
              {stages.map((stage) => {
                const Icon = stage.icon;
                return (
                  <button
                    key={stage.id}
                    onClick={() => handleRunStage(stage.id)}
                    disabled={isLoading}
                    className={cn(
                      "py-2 px-3 rounded-md text-sm font-medium transition-colors",
                      "border-2 border-tyton-gold bg-tyton-white hover:bg-tyton-gold-light",
                      "disabled:bg-gray-100 disabled:cursor-not-allowed",
                      "flex items-center gap-2",
                      activeStage === stage.id && "bg-tyton-gold border-tyton-gold-dark text-tyton-black"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {stage.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Last Result Display */}
          {lastResult && (
            <div className="mt-4 p-3 bg-tyton-black border-2 border-tyton-gold rounded-md">
              <h3 className="text-sm font-medium text-tyton-gold mb-2">Last Result</h3>
              <div className="text-xs text-tyton-white max-h-48 overflow-y-auto">
                <pre className="whitespace-pre-wrap">
                  {typeof lastResult === 'string' 
                    ? lastResult.substring(0, 500) + '...'
                    : JSON.stringify(lastResult, null, 2).substring(0, 500) + '...'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}