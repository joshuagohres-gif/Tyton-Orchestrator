// components/nodes/ElectronicsNode.tsx
"use client";

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { 
  Cpu, 
  Code, 
  TestTube, 
  Settings, 
  ExternalLink, 
  Plus, 
  Edit3, 
  AlertTriangle,
  CheckCircle2,
  Pin,
  FileText,
  Zap,
  X
} from 'lucide-react';

import { ModuleNodeShell, type TabDefinition, type ActionDefinition } from './ModuleNodeShell';
import type { ElectronicsModule, ElectronicsComponentZ } from './types';
import { validateModule } from './types';

interface ElectronicsNodeProps {
  module: ElectronicsModule;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onUpdate?: (updates: Partial<ElectronicsModule>) => void;
  onToggleCollapse?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onViewJSON?: () => void;
  onAutoAssignFootprints?: () => void;
  onOpenPinMap?: () => void;
  className?: string;
}

interface EditableComponentProps {
  component: ElectronicsModule['meta']['components'][0];
  onUpdate: (updates: Partial<ElectronicsModule['meta']['components'][0]>) => void;
  onDelete: () => void;
}

function EditableComponent({ component, onUpdate, onDelete }: EditableComponentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(component);

  const handleSave = useCallback(() => {
    // Validate the component data
    try {
      ElectronicsComponentZ.parse(editData);
      onUpdate(editData);
      setIsEditing(false);
    } catch (error) {
      console.error('Component validation failed:', error);
    }
  }, [editData, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditData(component);
    setIsEditing(false);
  }, [component]);

  const isTBD = !component.symbol || component.symbol === 'TBD' || !component.footprint || component.footprint === 'TBD';
  const hasDatasheet = component.datasheet_url;

  if (isEditing) {
    return (
      <div className="p-3 border border-blue-200 rounded-lg bg-blue-50">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
            <input
              type="text"
              value={editData.ref}
              onChange={(e) => setEditData({ ...editData, ref: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
            <input
              type="text"
              value={editData.value || ''}
              onChange={(e) => setEditData({ ...editData, value: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">MPN</label>
            <input
              type="text"
              value={editData.mpn || ''}
              onChange={(e) => setEditData({ ...editData, mpn: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Symbol</label>
            <input
              type="text"
              value={editData.symbol || ''}
              onChange={(e) => setEditData({ ...editData, symbol: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Footprint</label>
            <input
              type="text"
              value={editData.footprint || ''}
              onChange={(e) => setEditData({ ...editData, footprint: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Datasheet URL</label>
            <input
              type="url"
              value={editData.datasheet_url || ''}
              onChange={(e) => setEditData({ ...editData, datasheet_url: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-sm font-medium text-gray-900">{component.ref}</span>
          {isTBD && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
              <AlertTriangle className="w-3 h-3 mr-1" />
              TBD
            </span>
          )}
          {component.confidence !== undefined && (
            <span className={clsx(
              "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
              component.confidence >= 0.8 
                ? "bg-green-100 text-green-800"
                : component.confidence >= 0.6
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800"
            )}>
              {Math.round(component.confidence * 100)}%
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-gray-600">
          <div>{component.value || 'No value'}</div>
          <div className="text-xs text-gray-500">
            {component.mpn || 'No MPN'} • {component.symbol || 'No symbol'} • {component.footprint || 'No footprint'}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-1 ml-3">
        {hasDatasheet && (
          <button
            onClick={() => window.open(component.datasheet_url, '_blank')}
            className="p-1 text-blue-600 hover:text-blue-700 transition-colors"
            title="Open datasheet"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 text-gray-600 hover:text-gray-700 transition-colors"
          title="Edit component"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-red-600 hover:text-red-700 transition-colors"
          title="Delete component"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ElectronicsNode({
  module,
  isSelected = false,
  isCollapsed = false,
  onUpdate,
  onToggleCollapse,
  onDuplicate,
  onDelete,
  onViewJSON,
  onAutoAssignFootprints,
  onOpenPinMap,
  className
}: ElectronicsNodeProps) {
  const [showAddComponent, setShowAddComponent] = useState(false);

  const handleUpdateComponent = useCallback((index: number, updates: Partial<ElectronicsModule['meta']['components'][0]>) => {
    if (!onUpdate || !module?.meta?.components) return;
    
    const newComponents = [...module?.meta?.components || []];
    newComponents[index] = { ...newComponents[index], ...updates };
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        components: newComponents
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.components, onUpdate]);

  const handleDeleteComponent = useCallback((index: number) => {
    if (!onUpdate || !module?.meta?.components) return;
    
    const newComponents = module?.meta?.components?.filter((_, i) => i !== index) || [];
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        components: newComponents
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.components, onUpdate]);

  const handleAddComponent = useCallback((newComponent: ElectronicsModule['meta']['components'][0]) => {
    if (!onUpdate || !module?.meta?.components) return;
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        components: [...(module?.meta?.components || []), newComponent]
      },
      updatedAt: new Date().toISOString()
    });
    setShowAddComponent(false);
  }, [module?.meta?.components, onUpdate]);

  const tbdCount = module?.meta?.components?.filter(c => 
    !c.symbol || c.symbol === 'TBD' || !c.footprint || c.footprint === 'TBD'
  ).length || 0;

  const readyCount = module?.meta?.components?.filter(c => 
    c.symbol && c.symbol !== 'TBD' && c.footprint && c.footprint !== 'TBD'
  ).length || 0;

  // Tab definitions
  const tabs: TabDefinition[] = [
    {
      id: 'details',
      label: 'Details',
      icon: <Cpu className="w-4 h-4" />,
      badge: module?.meta?.components?.length || undefined,
      content: (
        <div className="space-y-4">
          {/* Component List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">Components</h4>
              <button
                onClick={() => setShowAddComponent(true)}
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Component
              </button>
            </div>

            {(module?.meta?.components?.length || 0) === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <Cpu className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No components added yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {module?.meta?.components?.map((component, index) => (
                  <EditableComponent
                    key={`${component.ref}-${index}`}
                    component={component}
                    onUpdate={(updates) => handleUpdateComponent(index, updates)}
                    onDelete={() => handleDeleteComponent(index)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div className="text-center">
              <div className="text-lg font-semibold text-green-600">{readyCount}</div>
              <div className="text-xs text-gray-600">Ready</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-amber-600">{tbdCount}</div>
              <div className="text-xs text-gray-600">TBD</div>
            </div>
          </div>

          {/* EDA Links */}
          {(module?.meta?.schematic_path || module?.meta?.pcb_path) && (
            <div className="pt-4 border-t border-gray-200">
              <h5 className="text-xs font-medium text-gray-700 mb-2">EDA Files</h5>
              <div className="space-y-1">
                {module?.meta?.schematic_path && (
                  <div className="flex items-center text-sm text-blue-600">
                    <FileText className="w-4 h-4 mr-2" />
                    Schematic: {module?.meta?.schematic_path}
                  </div>
                )}
                {module?.meta?.pcb_path && (
                  <div className="flex items-center text-sm text-blue-600">
                    <Cpu className="w-4 h-4 mr-2" />
                    PCB: {module?.meta?.pcb_path}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'firmware',
      label: 'Software/Firmware',
      icon: <Code className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          {module?.meta?.firmware ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target</label>
                <div className="text-sm text-gray-900">{module?.meta?.firmware?.target}</div>
              </div>
              
              {module?.meta?.firmware?.artifacts && module?.meta?.firmware?.artifacts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Artifacts</label>
                  <div className="space-y-1">
                    {module?.meta?.firmware?.artifacts.map((artifact, index) => (
                      <div key={index} className="flex items-center text-sm text-gray-600">
                        <FileText className="w-4 h-4 mr-2 text-gray-400" />
                        {artifact.path}
                        {artifact.type && (
                          <span className="ml-2 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                            {artifact.type}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {module?.meta?.firmware?.build_command && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Build Command</label>
                  <code className="block p-2 text-sm bg-gray-100 rounded font-mono">
                    {module?.meta?.firmware?.build_command}
                  </code>
                </div>
              )}
              
              {module?.meta?.firmware?.flash_command && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Flash Command</label>
                  <code className="block p-2 text-sm bg-gray-100 rounded font-mono">
                    {module?.meta?.firmware?.flash_command}
                  </code>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Code className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No firmware configuration</p>
              <button className="mt-2 text-sm text-blue-600 hover:text-blue-700">
                Add firmware config
              </button>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'testing',
      label: 'Testing',
      icon: <TestTube className="w-4 h-4" />,
      badge: module?.meta?.testing?.steps.length || undefined,
      content: (
        <div className="space-y-4">
          {module?.meta?.testing ? (
            <>
              {module?.meta?.testing?.steps?.length > 0 ? (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Test Steps</h5>
                  <div className="space-y-2">
                    {module?.meta?.testing?.steps?.map((step, index) => (
                      <div key={index} className="flex items-start space-x-3 p-2 border border-gray-200 rounded">
                        {step.result === 'pass' && <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />}
                        {step.result === 'fail' && <X className="w-4 h-4 text-red-600 mt-0.5" />}
                        {!step.result && <div className="w-4 h-4 border-2 border-gray-300 rounded mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{step.name}</div>
                          <div className="text-sm text-gray-600">{step.description}</div>
                          {step.expected && (
                            <div className="text-xs text-gray-500 mt-1">Expected: {step.expected}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <TestTube className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No test steps defined</p>
                </div>
              )}
              
              {module?.meta?.testing?.pass_rate !== undefined && (
                <div className="pt-4 border-t border-gray-200">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-gray-900">
                      {Math.round((module?.meta?.testing?.pass_rate || 0) * 100)}%
                    </div>
                    <div className="text-xs text-gray-600">Pass Rate</div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <TestTube className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No testing configuration</p>
              <button className="mt-2 text-sm text-blue-600 hover:text-blue-700">
                Add test plan
              </button>
            </div>
          )}
        </div>
      )
    }
  ];

  // Right actions
  const rightActions: ActionDefinition[] = [
    {
      id: 'auto-assign',
      label: 'Auto-assign footprints',
      icon: <Settings className="w-4 h-4" />,
      onClick: onAutoAssignFootprints || (() => {}),
      disabled: !onAutoAssignFootprints || tbdCount === 0,
      variant: 'primary'
    },
    {
      id: 'pin-map',
      label: 'Open pin map',
      icon: <Pin className="w-4 h-4" />,
      onClick: onOpenPinMap || (() => {}),
      disabled: !onOpenPinMap
    }
  ];

  // Footer with dependency info
  const footer = (module?.dependsOn?.length || 0) > 0 ? (
    <div className="text-xs text-gray-600">
      <span className="font-medium">Dependencies:</span> {module?.dependsOn?.join(', ')}
    </div>
  ) : undefined;

  return (
    <ModuleNodeShell
      module={module}
      tabs={tabs}
      defaultTab="details"
      rightActions={rightActions}
      footer={footer}
      isSelected={isSelected}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onViewJSON={onViewJSON}
      className={className}
    />
  );
}

export default ElectronicsNode;