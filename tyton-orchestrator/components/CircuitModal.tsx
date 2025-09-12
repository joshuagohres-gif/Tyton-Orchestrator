'use client';

import React, { useState } from 'react';
import { X, Zap, Cpu, AlertCircle, CheckCircle, Info, ExternalLink, Copy, Play, Loader2, Eye, Settings } from 'lucide-react';
import SchematicDiagram from './SchematicDiagram';
import { DiagramPanel } from '../app/projects/[id]/DiagramPanel';
import { EdaPanel } from '../app/projects/[id]/EdaPanel';

interface CircuitModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
  projectId: string;
  schematicModule?: any;
  wiringModule?: any;
  onRefresh?: () => void;
}

export default function CircuitModal({ 
  isOpen, 
  onClose, 
  projectTitle,
  projectId,
  schematicModule,
  wiringModule,
  onRefresh
}: CircuitModalProps) {
  const [activeTab, setActiveTab] = useState<'schematic' | 'wiring' | 'components' | 'diagram' | 'eda'>('schematic');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  if (!isOpen) return null;

  const spec = schematicModule?.metadata?.schematicSpec;
  const validator = schematicModule?.metadata?.validator;
  const wiringData = wiringModule?.metadata?.wiring;
  const layoutData = schematicModule?.metadata?.layout;
  const fullOutput = schematicModule?.metadata?.fullOutput;

  const handleCopyJson = async () => {
    if (spec) {
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
      setCopiedText('Schematic JSON copied!');
      setTimeout(() => setCopiedText(null), 2000);
    }
  };

  const handleGenerateCircuit = async () => {
    setGenerating(true);
    setGenerateError(null);
    
    try {
      const response = await fetch(`/api/projects/${projectId}/schematic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectContext: `Generate circuit diagram for project: ${projectTitle}`,
          selectedComponentsJson: null,
          pinMapJson: null,
          powerConstraints: null,
          safetyComplianceNotes: null,
        }),
      });
      
      const result = await response.json();
      
      if (result.ok) {
        // Success - refresh the parent to get new data
        if (onRefresh) {
          onRefresh();
        }
        setCopiedText('Circuit diagram generated successfully!');
        setTimeout(() => setCopiedText(null), 3000);
      } else {
        setGenerateError(result.error || 'Failed to generate circuit diagram');
      }
    } catch (error: any) {
      setGenerateError(error.message || 'Network error occurred');
    } finally {
      setGenerating(false);
    }
  };

  const tabs = [
    { id: 'schematic', label: 'Schematic', icon: Zap },
    { id: 'wiring', label: 'Wiring', icon: Cpu },
    { id: 'components', label: 'Components', icon: Cpu },
    { id: 'diagram', label: 'Diagram', icon: Eye },
    { id: 'eda', label: 'EDA Layout', icon: Settings },
  ];

  return (
    <div className="fixed inset-0 bg-tyton-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-tyton-white border-4 border-tyton-gold rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-tyton-black border-b-2 border-tyton-gold px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-tyton-gold" />
            <div>
              <h2 className="text-xl font-bold text-tyton-gold">Circuit Diagram</h2>
              <p className="text-sm text-tyton-gold-light">{projectTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {copiedText && (
              <span className="text-sm text-tyton-gold animate-pulse">{copiedText}</span>
            )}
            {generateError && (
              <span className="text-sm text-red-400">{generateError}</span>
            )}
            <button
              onClick={onClose}
              className="text-tyton-gold hover:text-tyton-gold-light transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Validation Status Bar */}
        {validator && (
          <div className="bg-tyton-gray-warm border-b-2 border-tyton-gold px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {validator.ok ? (
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Validation Passed</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">{validator.errors?.length || 0} Errors</span>
                  </div>
                )}
                {validator.warnings?.length > 0 && (
                  <div className="flex items-center gap-2 text-yellow-700">
                    <Info className="w-4 h-4" />
                    <span className="text-sm">{validator.warnings.length} Warnings</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!spec && !wiringModule && (
                  <button
                    onClick={handleGenerateCircuit}
                    disabled={generating}
                    className="flex items-center gap-2 px-3 py-1 bg-tyton-gold text-tyton-black text-sm rounded hover:bg-tyton-gold-light transition-colors disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3" />
                        Generate
                      </>
                    )}
                  </button>
                )}
                {spec && (
                  <button
                    onClick={handleCopyJson}
                    className="flex items-center gap-2 px-3 py-1 bg-tyton-gold text-tyton-black text-sm rounded hover:bg-tyton-gold-light transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Copy JSON
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b-2 border-tyton-gold">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeTab === tab.id
                    ? "bg-tyton-white border-b-2 border-tyton-gold text-tyton-black"
                    : "bg-tyton-gray-warm text-tyton-black hover:bg-tyton-gold-light"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-300px)] p-6">
          {!spec && !wiringModule ? (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 text-tyton-gold mx-auto mb-3" />
              <p className="text-tyton-black mb-4">No circuit diagram generated yet</p>
              <p className="text-sm text-tyton-black-soft mb-6">
                Generate a detailed circuit schematic and wiring instructions for this project
              </p>
              <button
                onClick={handleGenerateCircuit}
                disabled={generating}
                className="flex items-center gap-2 px-6 py-3 bg-tyton-gold text-tyton-black font-semibold rounded-lg hover:bg-tyton-gold-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Generate Circuit Diagram
                  </>
                )}
              </button>
            </div>
          ) : (
            <div>
              
              {/* Schematic Tab */}
              {activeTab === 'schematic' && (
                <div className="space-y-6">
                  {schematicModule?.detailsMd ? (
                    <div className="prose prose-sm max-w-none">
                      <div 
                        className="text-tyton-black whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ 
                          __html: schematicModule.detailsMd
                            .replace(/##\s+(.*)/g, '<h3 class="text-lg font-semibold text-tyton-black mb-3">$1</h3>')
                            .replace(/###\s+(.*)/g, '<h4 class="text-base font-medium text-tyton-black mb-2">$1</h4>')
                            .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                            .replace(/- (.*)/g, '<div class="ml-4 mb-1">• $1</div>')
                            .replace(/`([^`]+)`/g, '<code class="bg-tyton-gray-warm px-1 rounded">$1</code>')
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-tyton-black-soft">No schematic details available</p>
                  )}

                  {/* Power Tree */}
                  {spec?.powerTree?.rails && spec.powerTree.rails.length > 0 && (
                    <div className="border-2 border-tyton-gold rounded-lg p-4">
                      <h4 className="font-semibold text-tyton-black mb-3">Power Distribution</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {spec.powerTree.rails.map((rail: any, idx: number) => (
                          <div key={idx} className="bg-tyton-gray-warm p-3 rounded">
                            <div className="font-mono text-sm font-semibold text-tyton-black">{rail.name}</div>
                            <div className="text-xs text-tyton-black-soft">
                              {rail.voltage}V @ {rail.current}A
                            </div>
                            <div className="text-xs text-tyton-black-soft">{rail.regulation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Buses */}
                  {spec?.buses && spec.buses.length > 0 && (
                    <div className="border-2 border-tyton-gold rounded-lg p-4">
                      <h4 className="font-semibold text-tyton-black mb-3">Communication Buses</h4>
                      <div className="space-y-3">
                        {spec.buses.map((bus: any, idx: number) => (
                          <div key={idx} className="bg-tyton-gray-warm p-3 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-tyton-black">{bus.name}</span>
                              <span className="text-xs bg-tyton-gold text-tyton-black px-2 py-1 rounded">
                                {bus.type}
                              </span>
                            </div>
                            <div className="text-xs text-tyton-black-soft">
                              Nets: {bus.nets?.join(', ') || 'N/A'}
                            </div>
                            <div className="text-xs text-tyton-black-soft mt-1">
                              Devices: {bus.devices?.map((d: any) => 
                                `${d.refDes}(${d.role}${d.address !== 'N/A' ? '@' + d.address : ''})`
                              ).join(', ') || 'N/A'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Wiring Tab */}
              {activeTab === 'wiring' && (
                <div className="space-y-4">
                  {wiringModule?.detailsMd ? (
                    <div 
                      className="prose prose-sm max-w-none text-tyton-black whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ 
                        __html: wiringModule.detailsMd
                          .replace(/##\s+(.*)/g, '<h3 class="text-lg font-semibold text-tyton-black mb-3 mt-6">$1</h3>')
                          .replace(/###\s+(.*)/g, '<h4 class="text-base font-medium text-tyton-black mb-2 mt-4">$1</h4>')
                          .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                          .replace(/- (.*)/g, '<div class="ml-4 mb-1">• $1</div>')
                          .replace(/`([^`]+)`/g, '<code class="bg-tyton-gray-warm px-1 rounded text-sm">$1</code>')
                          .replace(/❌/g, '<span class="text-red-600">❌</span>')
                          .replace(/⚠️/g, '<span class="text-yellow-600">⚠️</span>')
                          .replace(/ℹ️/g, '<span class="text-blue-600">ℹ️</span>')
                          .replace(/✅/g, '<span class="text-green-600">✅</span>')
                      }}
                    />
                  ) : (
                    <p className="text-tyton-black-soft">No wiring instructions available</p>
                  )}
                </div>
              )}

              {/* Components Tab */}
              {activeTab === 'components' && (
                <div className="space-y-4">
                  {spec?.components && spec.components.length > 0 ? (
                    <div className="space-y-4">
                      {spec.components.map((comp: any, idx: number) => (
                        <div key={idx} className="border-2 border-tyton-gold rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <span className="font-mono text-lg font-semibold text-tyton-black">{comp.refDes || comp.ref}</span>
                              <span className="text-sm text-tyton-black-soft ml-3">{comp.mpn}</span>
                            </div>
                            <span className="text-xs bg-tyton-gold text-tyton-black px-2 py-1 rounded">
                              {comp.package || comp.footprint}
                            </span>
                          </div>
                          <p className="text-sm text-tyton-black mb-3">{comp.description}</p>
                          
                          {comp.pins && Object.keys(comp.pins).length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-tyton-black mb-2">Pins</h5>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {Object.entries(comp.pins).map(([pinNum, pin]: [string, any]) => (
                                  <div key={pinNum} className="bg-tyton-gray-warm p-2 rounded text-xs">
                                    <div className="font-mono font-semibold">{pinNum}: {pin.name}</div>
                                    <div className="text-tyton-black-soft">{pin.type}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-tyton-black-soft">No components available</p>
                  )}
                </div>
              )}

              {/* Diagram Tab */}
              {activeTab === 'diagram' && (
                <div className="space-y-4">
                  {spec ? (
                    <DiagramPanel projectId={projectId} spec={spec} />
                  ) : (
                    <div className="text-center py-12">
                      <Eye className="w-12 h-12 text-tyton-gold mx-auto mb-3" />
                      <p className="text-tyton-black mb-4">No schematic specification available</p>
                      <p className="text-sm text-tyton-black-soft mb-6">
                        Generate a schematic first to create an interactive diagram
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* EDA Layout Tab */}
              {activeTab === 'eda' && (
                <div className="h-full">
                  <EdaPanel 
                    projectId={projectId} 
                    schematicSpec={spec}
                    onRefresh={onRefresh}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {spec && (
          <div className="border-t-2 border-tyton-gold bg-tyton-black px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-tyton-gold text-sm">
                <span>Spec v{spec.version}</span>
                {spec.components && (
                  <span>{spec.components.length} components</span>
                )}
                {spec.nets && (
                  <span>{spec.nets.length} nets</span>
                )}
              </div>
              {spec.project?.author && (
                <div className="text-tyton-gold text-sm">
                  Generated by {spec.project.author}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}