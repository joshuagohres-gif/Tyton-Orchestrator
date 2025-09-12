"use client";

import { useState, useEffect, useMemo } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, PlayIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';

import CircuitPanel from './CircuitPanel';
import type { EdaSpecV1 } from '@/server/eda/specs/edaSpecV10';

interface EdaStepperProps {
  projectId: string;
  initialSpec?: EdaSpecV1;
  onStepComplete?: (step: string, data: any) => void;
  onExport?: (format: string, data: any) => void;
  className?: string;
}

interface StepStatus {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  data?: any;
  errors?: string[];
  warnings?: string[];
  info?: string[];
}

const DEFAULT_STEPS: StepStatus[] = [
  {
    id: 'text_input',
    name: 'Text Input',
    description: 'Provide schematic description or JSON specification',
    status: 'pending'
  },
  {
    id: 'spec_ingestion',
    name: 'Specification Ingestion',
    description: 'Parse and validate schematic specification',
    status: 'pending'
  },
  {
    id: 'library_mapping',
    name: 'Library Mapping',
    description: 'Map components to KiCad symbols and footprints',
    status: 'pending'
  },
  {
    id: 'netlist_generation',
    name: 'Netlist Generation', 
    description: 'Generate neutral netlist and validate connections',
    status: 'pending'
  },
  {
    id: 'erc_validation',
    name: 'Electrical Rules Check',
    description: 'Validate electrical design rules and connectivity',
    status: 'pending'
  },
  {
    id: 'layout_generation',
    name: 'Automatic Layout',
    description: 'Generate component placement using ELK algorithm',
    status: 'pending'
  },
  {
    id: 'drc_validation',
    name: 'Design Rules Check',
    description: 'Validate physical design constraints',
    status: 'pending'
  },
  {
    id: 'export_generation',
    name: 'Export Generation',
    description: 'Generate KiCad files, netlists, and 3D previews',
    status: 'pending'
  }
];

export default function EdaStepper({
  projectId,
  initialSpec,
  onStepComplete,
  onExport,
  className = ""
}: EdaStepperProps) {
  const [steps, setSteps] = useState<StepStatus[]>(DEFAULT_STEPS);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [edaSpec, setEdaSpec] = useState<EdaSpecV1 | null>(initialSpec || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [layout, setLayout] = useState<any>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const currentStep = steps[currentStepIndex];
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;
  const progress = (completedSteps / totalSteps) * 100;

  // Update step status
  const updateStepStatus = (stepId: string, updates: Partial<StepStatus>) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, ...updates } : step
    ));
  };

  // Move to next step
  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  // Move to previous step
  const previousStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  // Execute current step
  const executeStep = async () => {
    const step = currentStep;
    if (!step || step.status === 'completed') return;

    setIsProcessing(true);
    updateStepStatus(step.id, { status: 'in_progress' });

    try {
      let result: any = {};
      
      switch (step.id) {
        case 'text_input':
          result = await handleTextInput();
          break;
        case 'spec_ingestion':
          result = await handleSpecIngestion();
          break;
        case 'library_mapping':
          result = await handleLibraryMapping();
          break;
        case 'netlist_generation':
          result = await handleNetlistGeneration();
          break;
        case 'erc_validation':
          result = await handleErcValidation();
          break;
        case 'layout_generation':
          result = await handleLayoutGeneration();
          break;
        case 'drc_validation':
          result = await handleDrcValidation();
          break;
        case 'export_generation':
          result = await handleExportGeneration();
          break;
        default:
          throw new Error(`Unknown step: ${step.id}`);
      }

      updateStepStatus(step.id, { 
        status: 'completed', 
        data: result,
        errors: result.errors || [],
        warnings: result.warnings || [],
        info: result.info || []
      });

      onStepComplete?.(step.id, result);
      
      // Auto-advance to next step if successful
      if (result.errors?.length === 0) {
        setTimeout(() => nextStep(), 500);
      }

    } catch (error) {
      updateStepStatus(step.id, { 
        status: 'error', 
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        info: []
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Step handlers
  const handleTextInput = async () => {
    if (!textInput.trim()) {
      throw new Error('Please provide text input');
    }
    return { input: textInput, length: textInput.length };
  };

  const handleSpecIngestion = async () => {
    const response = await fetch('/api/eda/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textInput })
    });
    
    if (!response.ok) {
      throw new Error('Failed to ingest specification');
    }
    
    const result = await response.json();
    if (result.spec) {
      setEdaSpec(result.spec);
    }
    
    return result;
  };

  const handleLibraryMapping = async () => {
    if (!edaSpec) throw new Error('No EDA specification available');
    
    const response = await fetch('/api/eda/library/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eda: edaSpec })
    });
    
    if (!response.ok) {
      throw new Error('Failed to perform library mapping');
    }
    
    const result = await response.json();
    if (result.eda) {
      setEdaSpec(result.eda);
    }
    
    return result;
  };

  const handleNetlistGeneration = async () => {
    if (!edaSpec) throw new Error('No EDA specification available');
    
    const response = await fetch('/api/eda/build/netlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eda: edaSpec })
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate netlist');
    }
    
    return await response.json();
  };

  const handleErcValidation = async () => {
    if (!edaSpec) throw new Error('No EDA specification available');
    
    const response = await fetch('/api/eda/validation/erc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eda: edaSpec })
    });
    
    if (!response.ok) {
      throw new Error('Failed to run ERC validation');
    }
    
    return await response.json();
  };

  const handleLayoutGeneration = async () => {
    if (!edaSpec) throw new Error('No EDA specification available');
    
    const response = await fetch('/api/eda/layout/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        eda: edaSpec,
        algorithm: 'layered',
        direction: 'RIGHT'
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate layout');
    }
    
    const result = await response.json();
    if (result.layout) {
      setLayout(result.layout);
    }
    
    return result;
  };

  const handleDrcValidation = async () => {
    if (!edaSpec) throw new Error('No EDA specification available');
    
    const response = await fetch('/api/eda/validation/drc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eda: edaSpec })
    });
    
    if (!response.ok) {
      throw new Error('Failed to run DRC validation');
    }
    
    return await response.json();
  };

  const handleExportGeneration = async () => {
    if (!edaSpec) throw new Error('No EDA specification available');
    
    const exports = ['kicad', 'netlist', 'dsn'];
    const results: any = {};
    
    for (const format of exports) {
      try {
        const response = await fetch(`/api/eda/export/${format}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eda: edaSpec, layout })
        });
        
        if (response.ok) {
          results[format] = await response.json();
        }
      } catch (error) {
        results[format] = { error: error instanceof Error ? error.message : 'Export failed' };
      }
    }
    
    return { exports: results };
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep.id) {
      case 'text_input':
        return (
          <div className="space-y-4">
            <div>
              <label htmlFor="text-input" className="block text-sm font-medium text-gray-700 mb-2">
                Schematic Description or JSON
              </label>
              <textarea
                id="text-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste your schematic description, JSON specification, or describe your circuit..."
                className="w-full h-40 p-3 border border-gray-300 rounded-lg font-mono text-sm"
              />
            </div>
            <div className="text-sm text-gray-600">
              <p>You can provide:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Natural language description of your circuit</li>
                <li>JSON schematic specification (v1.2)</li>
                <li>Component list with connections</li>
                <li>Mixed text with embedded JSON blocks</li>
              </ul>
            </div>
          </div>
        );

      case 'layout_generation':
        return (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Layout Preview</h4>
              {edaSpec && layout && (
                <div className="border border-gray-200 rounded-lg overflow-hidden h-64">
                  <CircuitPanel 
                    eda={edaSpec}
                    layout={layout}
                    readonly={true}
                    className="w-full h-full"
                  />
                </div>
              )}
            </div>
            
            {showAdvancedOptions && (
              <div className="space-y-3">
                <h5 className="font-medium text-gray-800">Layout Options</h5>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Algorithm</label>
                    <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm">
                      <option value="layered">Layered (Hierarchical)</option>
                      <option value="force">Force-Directed</option>
                      <option value="stress">Stress Minimization</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Direction</label>
                    <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-sm">
                      <option value="RIGHT">Left to Right</option>
                      <option value="DOWN">Top to Bottom</option>
                      <option value="LEFT">Right to Left</option>
                      <option value="UP">Bottom to Top</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            <button
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
            </button>
          </div>
        );

      case 'export_generation':
        return (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Available Exports</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium text-gray-800">KiCad Project</h5>
                  <p className="text-sm text-gray-600 mt-1">Complete KiCad project files (.kicad_pro, .kicad_sch, .kicad_pcb)</p>
                  <button 
                    onClick={() => onExport?.('kicad', { eda: edaSpec, layout })}
                    className="mt-2 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  >
                    Download
                  </button>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium text-gray-800">Netlist</h5>
                  <p className="text-sm text-gray-600 mt-1">Standard netlist for SPICE, routing, or other tools</p>
                  <button 
                    onClick={() => onExport?.('netlist', { eda: edaSpec })}
                    className="mt-2 px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                  >
                    Download
                  </button>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium text-gray-800">DSN (Freerouting)</h5>
                  <p className="text-sm text-gray-600 mt-1">Specctra DSN file for autorouting</p>
                  <button 
                    onClick={() => onExport?.('dsn', { eda: edaSpec, layout })}
                    className="mt-2 px-3 py-1 bg-purple-500 text-white text-sm rounded hover:bg-purple-600"
                  >
                    Download
                  </button>
                </div>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <h5 className="font-medium text-gray-800">3D Preview (GLB)</h5>
                  <p className="text-sm text-gray-600 mt-1">3D board visualization for web viewers</p>
                  <button 
                    onClick={() => onExport?.('glb', { eda: edaSpec, layout })}
                    className="mt-2 px-3 py-1 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        // Show step results for validation and generation steps
        const stepData = currentStep.data;
        return (
          <div className="space-y-3">
            {stepData && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Step Results</h4>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap overflow-auto max-h-32">
                  {JSON.stringify(stepData, null, 2)}
                </pre>
              </div>
            )}
            
            {currentStep.errors && currentStep.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <h5 className="font-medium text-red-800 mb-1">Errors</h5>
                <ul className="text-sm text-red-700 space-y-1">
                  {currentStep.errors.map((error, i) => (
                    <li key={i}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {currentStep.warnings && currentStep.warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h5 className="font-medium text-yellow-800 mb-1">Warnings</h5>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {currentStep.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className={`max-w-4xl mx-auto ${className}`}>
      {/* Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">EDA Workflow</h2>
          <div className="text-sm text-gray-500">
            {completedSteps} of {totalSteps} completed
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Steps Sidebar */}
        <div className="lg:col-span-1">
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`
                  flex items-center p-3 rounded-lg cursor-pointer transition-colors
                  ${index === currentStepIndex ? 'bg-blue-50 border-2 border-blue-200' : 'bg-white border border-gray-200'}
                  ${step.status === 'completed' ? 'bg-green-50 border-green-200' : ''}
                  ${step.status === 'error' ? 'bg-red-50 border-red-200' : ''}
                `}
                onClick={() => setCurrentStepIndex(index)}
              >
                <div className="flex-shrink-0 mr-3">
                  {step.status === 'completed' && (
                    <CheckCircleIconSolid className="w-5 h-5 text-green-500" />
                  )}
                  {step.status === 'error' && (
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                  )}
                  {step.status === 'in_progress' && (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {step.status === 'pending' && (
                    <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {step.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {step.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            {/* Current Step Header */}
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900">{currentStep.name}</h3>
              <p className="text-gray-600 mt-1">{currentStep.description}</p>
            </div>

            {/* Step Content */}
            <div className="mb-6">
              {renderStepContent()}
            </div>

            {/* Step Actions */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <button
                onClick={previousStep}
                disabled={currentStepIndex === 0}
                className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                Previous
              </button>

              <div className="flex items-center space-x-3">
                {currentStep.status !== 'completed' && (
                  <button
                    onClick={executeStep}
                    disabled={isProcessing}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <PlayIcon className="w-4 h-4 mr-2" />
                        Execute Step
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={nextStep}
                  disabled={currentStepIndex === steps.length - 1}
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ArrowRightIcon className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}