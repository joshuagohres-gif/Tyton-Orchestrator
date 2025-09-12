// components/nodes/MechanicalNode.tsx
"use client";

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { 
  Wrench, 
  Ruler, 
  Paperclip, 
  Edit3, 
  Plus,
  X,
  Download,
  Eye,
  Upload
} from 'lucide-react';

import { ModuleNodeShell, type TabDefinition, type ActionDefinition } from './ModuleNodeShell';
import type { MechanicalModule, MechanicalDimensionZ, MechanicalAttachmentZ } from './types';

interface MechanicalNodeProps {
  module: MechanicalModule;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onUpdate?: (updates: Partial<MechanicalModule>) => void;
  onToggleCollapse?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onViewJSON?: () => void;
  onUploadAttachment?: (file: File) => Promise<string>;
  className?: string;
}

interface EditableDimensionProps {
  dimension: MechanicalModule['meta']['dimensions'][0];
  onUpdate: (updates: Partial<MechanicalModule['meta']['dimensions'][0]>) => void;
  onDelete: () => void;
}

function EditableDimension({ dimension, onUpdate, onDelete }: EditableDimensionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(dimension);

  const handleSave = useCallback(() => {
    try {
      MechanicalDimensionZ.parse(editData);
      onUpdate(editData);
      setIsEditing(false);
    } catch (error) {
      console.error('Dimension validation failed:', error);
    }
  }, [editData, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditData(dimension);
    setIsEditing(false);
  }, [dimension]);

  if (isEditing) {
    return (
      <div className="p-3 border border-blue-200 rounded-lg bg-blue-50">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
            <input
              type="number"
              step="0.1"
              value={editData.value}
              onChange={(e) => setEditData({ ...editData, value: parseFloat(e.target.value) || 0 })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
            <select
              value={editData.unit}
              onChange={(e) => setEditData({ ...editData, unit: e.target.value as any })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Tolerance</label>
            <input
              type="text"
              value={editData.tolerance || ''}
              onChange={(e) => setEditData({ ...editData, tolerance: e.target.value })}
              placeholder="±0.1"
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <input
              type="text"
              value={editData.notes || ''}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
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
          <span className="text-sm font-medium text-gray-900">{dimension.name}</span>
          <span className="text-sm text-gray-600">
            {dimension.value}{dimension.unit}
            {dimension.tolerance && (
              <span className="text-xs text-gray-500 ml-1">{dimension.tolerance}</span>
            )}
          </span>
        </div>
        {dimension.notes && (
          <div className="text-xs text-gray-500 mt-1">{dimension.notes}</div>
        )}
      </div>
      <div className="flex items-center space-x-1 ml-3">
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 text-gray-600 hover:text-gray-700 transition-colors"
          title="Edit dimension"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-red-600 hover:text-red-700 transition-colors"
          title="Delete dimension"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AttachmentItem({ 
  attachment,
  onView,
  onDownload,
  onDelete
}: {
  attachment: MechanicalModule['meta']['attachments'][0];
  onView?: () => void;
  onDownload?: () => void;
  onDelete: () => void;
}) {
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'step':
      case 'stl':
      case 'glb':
        return '🧊';
      case 'dwg':
        return '📐';
      case 'pdf':
        return '📄';
      default:
        return '📎';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <div className="text-2xl">{getFileIcon(attachment.type)}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{attachment.name}</div>
          <div className="text-xs text-gray-500">
            {attachment.type.toUpperCase()}
            {attachment.size_bytes && ` • ${formatFileSize(attachment.size_bytes)}`}
            {attachment.uploaded_at && ` • ${new Date(attachment.uploaded_at).toLocaleDateString()}`}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-1 ml-3">
        {onView && (
          <button
            onClick={onView}
            className="p-1 text-blue-600 hover:text-blue-700 transition-colors"
            title="View file"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
        {onDownload && (
          <button
            onClick={onDownload}
            className="p-1 text-green-600 hover:text-green-700 transition-colors"
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onDelete}
          className="p-1 text-red-600 hover:text-red-700 transition-colors"
          title="Delete file"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function MechanicalNode({
  module,
  isSelected = false,
  isCollapsed = false,
  onUpdate,
  onToggleCollapse,
  onDuplicate,
  onDelete,
  onViewJSON,
  onUploadAttachment,
  className
}: MechanicalNodeProps) {
  const [showAddDimension, setShowAddDimension] = useState(false);

  const handleUpdateDimension = useCallback((index: number, updates: Partial<MechanicalModule['meta']['dimensions'][0]>) => {
    if (!onUpdate) return;
    
    const newDimensions = [...(module?.meta?.dimensions || [])];
    newDimensions[index] = { ...newDimensions[index], ...updates };
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        dimensions: newDimensions
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.dimensions, onUpdate]);

  const handleDeleteDimension = useCallback((index: number) => {
    if (!onUpdate) return;
    
    const newDimensions = (module?.meta?.dimensions || []).filter((_, i) => i !== index);
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        dimensions: newDimensions
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.dimensions, onUpdate]);

  const handleDeleteAttachment = useCallback((index: number) => {
    if (!onUpdate) return;
    
    const newAttachments = (module?.meta?.attachments || []).filter((_, i) => i !== index);
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        attachments: newAttachments
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.dimensions, onUpdate]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadAttachment || !onUpdate) return;

    try {
      const path = await onUploadAttachment(file);
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      let fileType: MechanicalModule['meta']['attachments'][0]['type'] = 'pdf';
      
      if (['step', 'stp'].includes(fileExtension || '')) fileType = 'step';
      else if (fileExtension === 'stl') fileType = 'stl';
      else if (fileExtension === 'glb') fileType = 'glb';
      else if (fileExtension === 'dwg') fileType = 'dwg';

      const newAttachment: MechanicalModule['meta']['attachments'][0] = {
        name: file.name,
        path,
        type: fileType,
        size_bytes: file.size,
        uploaded_at: new Date().toISOString()
      };

      onUpdate({
        meta: {
          ...(module?.meta || {}),
          attachments: [...(module?.meta?.attachments || []), newAttachment]
        },
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('File upload failed:', error);
    }
  }, [module?.meta?.attachments, onUpdate, onUploadAttachment]);

  // Tab definitions
  const tabs: TabDefinition[] = [
    {
      id: 'details',
      label: 'Details',
      icon: <Wrench className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          {/* Basic Properties */}
          <div className="grid grid-cols-2 gap-4">
            {module?.meta?.material && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                <div className="text-sm text-gray-900">{module?.meta?.material}</div>
              </div>
            )}
            {module?.meta?.finish && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Finish</label>
                <div className="text-sm text-gray-900">{module?.meta?.finish}</div>
              </div>
            )}
          </div>

          {module?.meta?.manufacturing_process && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturing Process</label>
              <div className="text-sm text-gray-900">{module?.meta?.manufacturing_process}</div>
            </div>
          )}

          {/* Mount Points */}
          {(module?.meta?.mount_points?.length || 0) > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Mount Points</h5>
              <div className="space-y-1">
                {(module?.meta?.mount_points || []).map((point, index) => (
                  <div key={index} className="text-sm text-gray-600">
                    <span className="font-medium">{point.name}:</span> 
                    <span className="ml-1">
                      ({point.x}, {point.y}, {point.z})mm
                      {point.type && <span className="ml-2 text-xs bg-gray-100 px-1 rounded">{point.type}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'dimensions',
      label: 'Dimensions',
      icon: <Ruler className="w-4 h-4" />,
      badge: (module?.meta?.dimensions?.length || 0) || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Dimensions</h4>
            <button
              onClick={() => setShowAddDimension(true)}
              className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Dimension
            </button>
          </div>

          {(module?.meta?.dimensions?.length || 0) === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <Ruler className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No dimensions defined</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(module?.meta?.dimensions || []).map((dimension, index) => (
                <EditableDimension
                  key={index}
                  dimension={dimension}
                  onUpdate={(updates) => handleUpdateDimension(index, updates)}
                  onDelete={() => handleDeleteDimension(index)}
                />
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      id: 'attachments',
      label: 'Attachments',
      icon: <Paperclip className="w-4 h-4" />,
      badge: (module?.meta?.attachments?.length || 0) || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Files</h4>
            <label className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors cursor-pointer">
              <Upload className="w-3 h-3 mr-1" />
              Upload File
              <input
                type="file"
                accept=".step,.stp,.stl,.glb,.dwg,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {(module?.meta?.attachments?.length || 0) === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <Paperclip className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No files attached</p>
              <p className="text-xs text-gray-400 mt-1">STEP, STL, DWG, PDF supported</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(module?.meta?.attachments || []).map((attachment, index) => (
                <AttachmentItem
                  key={index}
                  attachment={attachment}
                  onView={() => window.open(attachment.path, '_blank')}
                  onDownload={() => {
                    const a = document.createElement('a');
                    a.href = attachment.path;
                    a.download = attachment.name;
                    a.click();
                  }}
                  onDelete={() => handleDeleteAttachment(index)}
                />
              ))}
            </div>
          )}
        </div>
      )
    }
  ];

  const rightActions: ActionDefinition[] = [];

  // Footer with dependency info
  const footer = module?.dependsOn && module.dependsOn.length > 0 ? (
    <div className="text-xs text-gray-600">
      <span className="font-medium">Dependencies:</span> {module.dependsOn.join(', ')}
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

export default MechanicalNode;