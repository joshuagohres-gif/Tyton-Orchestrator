'use client';

import React, { useState, useEffect } from 'react';
import { 
  Cpu, Settings, Move3D, Download, Play, Save, AlertCircle, CheckCircle, 
  RefreshCcw, FileText, Zap, Eye, Grid, ChevronRight, ChevronLeft,
  Package, Layers, Wrench, BookOpen, Star
} from 'lucide-react';

interface EdaPanelProps {
  projectId: string;
  schematicSpec?: any;
  onRefresh?: () => void;
}

interface EdaSpec {
  version: string;
  components: any[];
  netClasses: any[];
  board: any;
  placement: any[];
  constraints?: any;
  manufacturing?: any;
  openQuestions?: string[];
}

interface DrcResult {
  errors: string[];
  warnings: string[];
}

type StepId = 'footprints' | 'board' | 'placement' | 'export';

export function EdaPanel({ projectId, schematicSpec, onRefresh }: EdaPanelProps) {
  const [currentStep, setCurrentStep] = useState<StepId>('footprints');
  const [edaSpec, setEdaSpec] = useState<EdaSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drcResults, setDrcResults] = useState<DrcResult | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const steps = [
    { id: 'footprints' as StepId, label: 'Assign Footprints', icon: Package, description: 'Assign KiCad symbols and footprints' },
    { id: 'board' as StepId, label: 'Board Setup', icon: Layers, description: 'Configure board dimensions and stack-up' },
    { id: 'placement' as StepId, label: 'Placement', icon: Move3D, description: 'Position components on the board' },
    { id: 'export' as StepId, label: 'Export', icon: Download, description: 'Generate KiCad and DSN files' }
  ];

  // Load EDA spec on mount
  useEffect(() => {
    loadEdaSpec();
  }, [projectId]);

  const loadEdaSpec = async () => {
    try {
      setLoading(true);
      // In a real implementation, this would load from the database
      // For now, we'll simulate an EDA spec
      const mockEda: EdaSpec = {
        version: "1.0",
        components: schematicSpec?.components?.map((comp: any, index: number) => ({
          ref: comp.refDes || `U${index + 1}`,
          mpn: comp.mpn,
          value: comp.value,
          role: comp.description?.includes('MCU') ? 'MCU' : 'IC',
          symbol: undefined,
          footprint: undefined,
          orientation_deg: 0,
          attributes: { description: comp.description }
        })) || [],
        netClasses: [
          { name: 'SIGNAL', track_mm: 0.25, clearance_mm: 0.127, via_diam_mm: 0.8, via_drill_mm: 0.4 },
          { name: 'POWER', track_mm: 0.5, clearance_mm: 0.2, via_diam_mm: 1.0, via_drill_mm: 0.5 }
        ],
        board: {
          outline_mm: { width: 100, height: 80, corner_radius: 3 },
          layers: 2,
          stackup: 'std-2L',
          zones: [
            { net: 'GND', layer: 'F.Cu', clearance_mm: 0.2 },
            { net: 'GND', layer: 'B.Cu', clearance_mm: 0.2 }
          ]
        },
        placement: [],
        manufacturing: {
          fab: 'JLCPCB',
          thickness_mm: 1.6,
          min_track_mm: 0.127,
          min_clearance_mm: 0.127,
          finish: 'HASL'
        },
        openQuestions: ['EDA enrichment not yet run - click Auto-assign to populate footprints']
      };
      setEdaSpec(mockEda);
    } catch (err) {
      setError('Failed to load EDA specification');
    } finally {
      setLoading(false);
    }
  };

  const runEnrichment = async () => {
    if (!schematicSpec) {
      setError('No schematic specification available');
      return;
    }

    try {
      setEnriching(true);
      setError(null);
      
      const response = await fetch(`/api/projects/${projectId}/eda/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const result = await response.json();
      
      if (result.ok) {
        setEdaSpec(result.edaSpec);
        setHasUnsavedChanges(false);
        if (onRefresh) onRefresh();
      } else {
        setError(result.error || 'Enrichment failed');
      }
    } catch (err) {
      setError('Network error during enrichment');
    } finally {
      setEnriching(false);
    }
  };

  const exportKiCad = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/eda/export`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectId}_KiCad.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const error = await response.json();
        setError(error.error || 'Export failed');
        if (error.errors) {
          setDrcResults({ errors: error.errors, warnings: error.warnings || [] });
        }
      }
    } catch (err) {
      setError('Export failed');
    }
  };

  const exportDSN = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/eda/dsn`);
      
      if (response.ok) {
        const text = await response.text();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectId}.dsn`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const error = await response.json();
        setError(error.error || 'DSN export failed');
      }
    } catch (err) {
      setError('DSN export failed');
    }
  };

  const stepIndex = steps.findIndex(s => s.id === currentStep);
  const canGoNext = stepIndex < steps.length - 1;
  const canGoPrev = stepIndex > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading EDA specification...</div>
      </div>
    );
  }

  if (!edaSpec) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-600 mb-4">No EDA specification found</div>
        {schematicSpec ? (
          <button
            onClick={runEnrichment}
            disabled={enriching}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {enriching ? 'Generating...' : 'Generate EDA Spec'}
          </button>
        ) : (
          <div className="text-gray-600">Please generate schematic first</div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header with Steps */}
      <div className="border-b bg-gray-50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">EDA Layout Design</h3>
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2 text-orange-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              Unsaved changes
            </div>
          )}
        </div>
        
        {/* Step Indicator */}
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.id === currentStep;
            const isCompleted = index < stepIndex;
            
            return (
              <React.Fragment key={step.id}>
                <div 
                  className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${
                    isActive 
                      ? 'bg-blue-100 text-blue-700' 
                      : isCompleted 
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                  onClick={() => setCurrentStep(step.id)}
                >
                  <Icon className="w-4 h-4" />
                  <div>
                    <div className="font-medium">{step.label}</div>
                    <div className="text-xs opacity-75">{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 overflow-hidden">
        {currentStep === 'footprints' && (
          <FootprintsStep 
            edaSpec={edaSpec} 
            onUpdate={setEdaSpec} 
            onEnrich={runEnrichment}
            enriching={enriching}
            onChange={() => setHasUnsavedChanges(true)}
          />
        )}
        
        {currentStep === 'board' && (
          <BoardStep 
            edaSpec={edaSpec} 
            onUpdate={setEdaSpec}
            onChange={() => setHasUnsavedChanges(true)}
          />
        )}
        
        {currentStep === 'placement' && (
          <PlacementStep 
            edaSpec={edaSpec} 
            onUpdate={setEdaSpec}
            onChange={() => setHasUnsavedChanges(true)}
          />
        )}
        
        {currentStep === 'export' && (
          <ExportStep 
            edaSpec={edaSpec}
            drcResults={drcResults}
            onExportKiCad={exportKiCad}
            onExportDSN={exportDSN}
          />
        )}
      </div>

      {/* Navigation Footer */}
      <div className="border-t p-4 flex items-center justify-between bg-gray-50">
        <button
          onClick={() => setCurrentStep(steps[stepIndex - 1].id)}
          disabled={!canGoPrev}
          className="flex items-center gap-2 px-4 py-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {/* Save logic */}}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>

        <button
          onClick={() => setCurrentStep(steps[stepIndex + 1].id)}
          disabled={!canGoNext}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Step Components

function FootprintsStep({ edaSpec, onUpdate, onEnrich, enriching, onChange }: any) {
  const tbdComponents = edaSpec.components.filter((c: any) => !c.footprint || c.footprint === 'TBD');
  const assignedComponents = edaSpec.components.filter((c: any) => c.footprint && c.footprint !== 'TBD');

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-lg font-semibold">Component Footprints & Symbols</h4>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onEnrich}
              disabled={enriching}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {enriching ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Cpu className="w-4 h-4" />}
              {enriching ? 'Auto-assigning...' : 'Auto-assign (LLM)'}
            </button>
            <button
              onClick={() => {/* TODO: Implement library-only assignment */}}
              disabled={enriching}
              className="flex items-center gap-2 px-3 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50"
            >
              <BookOpen className="w-4 h-4" />
              Library Only
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assignment Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h5 className="font-medium mb-3">Assignment Status</h5>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-green-600">✓ Assigned</span>
              <span className="font-medium">{assignedComponents.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-orange-600">⚠ Need Assignment</span>
              <span className="font-medium">{tbdComponents.length}</span>
            </div>
            <div className="flex items-center justify-between font-medium pt-2 border-t">
              <span>Total Components</span>
              <span>{edaSpec.components.length}</span>
            </div>
          </div>
        </div>

        {/* Quick Fixes */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h5 className="font-medium mb-3">Quick Fixes</h5>
          <div className="space-y-2">
            <button className="w-full text-left p-2 bg-white rounded border hover:bg-gray-50">
              Resistors → 0603 footprints
            </button>
            <button className="w-full text-left p-2 bg-white rounded border hover:bg-gray-50">
              Capacitors → 0603 footprints
            </button>
            <button className="w-full text-left p-2 bg-white rounded border hover:bg-gray-50">
              Connectors → Pin headers
            </button>
          </div>
        </div>
      </div>

      {/* Components Table */}
      <div className="mt-6">
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium">Ref</th>
                  <th className="text-left p-3 font-medium">Value</th>
                  <th className="text-left p-3 font-medium">Symbol</th>
                  <th className="text-left p-3 font-medium">Footprint</th>
                  <th className="text-left p-3 font-medium">Group</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {edaSpec.components.map((comp: any, index: number) => (
                  <tr key={comp.ref} className="border-t">
                    <td className="p-3 font-mono">{comp.ref}</td>
                    <td className="p-3">{comp.value || comp.mpn || '—'}</td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={comp.symbol || ''}
                        onChange={(e) => {
                          const updated = { ...edaSpec };
                          updated.components[index].symbol = e.target.value;
                          onUpdate(updated);
                          onChange();
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="Device:R_Small"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={comp.footprint || ''}
                        onChange={(e) => {
                          const updated = { ...edaSpec };
                          updated.components[index].footprint = e.target.value;
                          onUpdate(updated);
                          onChange();
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="Resistor_SMD:R_0603_1608Metric"
                      />
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {comp.role || 'Misc'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {comp.footprint && comp.footprint !== 'TBD' ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-orange-600" />
                        )}
                        {/* Confidence indicator - you could add this from mapping notes */}
                        {comp.attributes?.mapping_confidence && comp.attributes.mapping_confidence > 0.9 && (
                          <div className="flex items-center">
                            <Star className="w-3 h-3 text-yellow-500 fill-current" />
                            <span className="text-xs text-gray-600">{Math.round(comp.attributes.mapping_confidence * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardStep({ edaSpec, onUpdate, onChange }: any) {
  return (
    <div className="p-6 h-full overflow-auto">
      <h4 className="text-lg font-semibold mb-6">Board Configuration</h4>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Board Dimensions */}
        <div className="space-y-4">
          <h5 className="font-medium">Board Dimensions</h5>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Width (mm)</label>
              <input
                type="number"
                value={edaSpec.board.outline_mm.width}
                onChange={(e) => {
                  const updated = { ...edaSpec };
                  updated.board.outline_mm.width = parseFloat(e.target.value) || 100;
                  onUpdate(updated);
                  onChange();
                }}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Height (mm)</label>
              <input
                type="number"
                value={edaSpec.board.outline_mm.height}
                onChange={(e) => {
                  const updated = { ...edaSpec };
                  updated.board.outline_mm.height = parseFloat(e.target.value) || 80;
                  onUpdate(updated);
                  onChange();
                }}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        </div>

        {/* Layer Stack */}
        <div className="space-y-4">
          <h5 className="font-medium">Layer Configuration</h5>
          <div>
            <label className="block text-sm font-medium mb-1">Layer Count</label>
            <select
              value={edaSpec.board.layers}
              onChange={(e) => {
                const updated = { ...edaSpec };
                updated.board.layers = parseInt(e.target.value);
                updated.board.stackup = e.target.value === '2' ? 'std-2L' : 'std-4L';
                onUpdate(updated);
                onChange();
              }}
              className="w-full px-3 py-2 border rounded"
            >
              <option value={2}>2 Layers</option>
              <option value={4}>4 Layers</option>
            </select>
          </div>
        </div>

        {/* Net Classes */}
        <div className="lg:col-span-2 space-y-4">
          <h5 className="font-medium">Net Classes</h5>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {edaSpec.netClasses.map((nc: any, index: number) => (
                <div key={nc.name} className="bg-white rounded border p-3">
                  <div className="font-medium mb-2">{nc.name}</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Track:</span>
                      <span>{nc.track_mm}mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Clearance:</span>
                      <span>{nc.clearance_mm}mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Via:</span>
                      <span>{nc.via_diam_mm}mm</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlacementStep({ edaSpec, onUpdate, onChange }: any) {
  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-lg font-semibold">Component Placement</h4>
        <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
          <Grid className="w-4 h-4" />
          Auto-place
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas Preview */}
        <div className="lg:col-span-2">
          <div className="bg-gray-100 rounded-lg p-4 h-96 flex items-center justify-center">
            <div className="text-gray-600">
              <Eye className="w-8 h-8 mx-auto mb-2" />
              <div>Placement Canvas</div>
              <div className="text-sm">(Interactive board view would go here)</div>
            </div>
          </div>
        </div>

        {/* Component Groups */}
        <div className="space-y-4">
          <h5 className="font-medium">Component Groups</h5>
          {['MCU', 'Power', 'Connectors', 'Decoupling', 'Sensors', 'Misc'].map(group => {
            const groupComponents = edaSpec.placement.filter((p: any) => p.group === group);
            return (
              <div key={group} className="bg-gray-50 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{group}</span>
                  <span className="text-sm text-gray-600">{groupComponents.length}</span>
                </div>
                <div className="space-y-1">
                  {groupComponents.slice(0, 3).map((comp: any) => (
                    <div key={comp.ref} className="text-sm font-mono">
                      {comp.ref}
                    </div>
                  ))}
                  {groupComponents.length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{groupComponents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExportStep({ edaSpec, drcResults, onExportKiCad, onExportDSN }: any) {
  const hasErrors = drcResults?.errors?.length > 0;
  const hasWarnings = drcResults?.warnings?.length > 0;

  return (
    <div className="p-6 h-full overflow-auto">
      <h4 className="text-lg font-semibold mb-6">Export & Manufacturing</h4>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Options */}
        <div className="space-y-4">
          <h5 className="font-medium">Export Formats</h5>
          
          <div className="space-y-3">
            <button
              onClick={onExportKiCad}
              className="w-full flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50"
            >
              <Package className="w-6 h-6 text-blue-600" />
              <div className="text-left">
                <div className="font-medium">KiCad Project (.zip)</div>
                <div className="text-sm text-gray-600">Complete project with schematic, PCB, and BOM</div>
              </div>
            </button>

            <button
              onClick={onExportDSN}
              className="w-full flex items-center gap-3 p-4 border rounded-lg hover:bg-gray-50"
            >
              <FileText className="w-6 h-6 text-green-600" />
              <div className="text-left">
                <div className="font-medium">DSN File</div>
                <div className="text-sm text-gray-600">For freerouting autorouter</div>
              </div>
            </button>
          </div>
        </div>

        {/* DRC Summary */}
        <div className="space-y-4">
          <h5 className="font-medium">Design Rule Check</h5>
          
          {hasErrors && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                <AlertCircle className="w-4 h-4" />
                {drcResults.errors.length} Error{drcResults.errors.length !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1 text-sm">
                {drcResults.errors.slice(0, 3).map((error: string, index: number) => (
                  <div key={index} className="text-red-600">• {error}</div>
                ))}
                {drcResults.errors.length > 3 && (
                  <div className="text-red-500">• +{drcResults.errors.length - 3} more errors</div>
                )}
              </div>
            </div>
          )}

          {hasWarnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
                <AlertCircle className="w-4 h-4" />
                {drcResults.warnings.length} Warning{drcResults.warnings.length !== 1 ? 's' : ''}
              </div>
              <div className="space-y-1 text-sm">
                {drcResults.warnings.slice(0, 3).map((warning: string, index: number) => (
                  <div key={index} className="text-yellow-600">• {warning}</div>
                ))}
                {drcResults.warnings.length > 3 && (
                  <div className="text-yellow-500">• +{drcResults.warnings.length - 3} more warnings</div>
                )}
              </div>
            </div>
          )}

          {!hasErrors && !hasWarnings && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <CheckCircle className="w-4 h-4" />
                No DRC issues found
              </div>
            </div>
          )}
        </div>

        {/* Manufacturing Info */}
        <div className="lg:col-span-2 bg-gray-50 rounded-lg p-4">
          <h5 className="font-medium mb-3">Manufacturing Specifications</h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-medium">Fab House</div>
              <div className="text-gray-600">{edaSpec.manufacturing?.fab || 'TBD'}</div>
            </div>
            <div>
              <div className="font-medium">Thickness</div>
              <div className="text-gray-600">{edaSpec.manufacturing?.thickness_mm || 1.6}mm</div>
            </div>
            <div>
              <div className="font-medium">Min Track</div>
              <div className="text-gray-600">{edaSpec.manufacturing?.min_track_mm || 0.127}mm</div>
            </div>
            <div>
              <div className="font-medium">Finish</div>
              <div className="text-gray-600">{edaSpec.manufacturing?.finish || 'HASL'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}