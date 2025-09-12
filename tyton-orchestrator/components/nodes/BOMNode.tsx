// components/nodes/BOMNode.tsx
"use client";

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { 
  Package, 
  DollarSign, 
  TrendingUp, 
  Plus, 
  Edit3, 
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  FileText,
  Calculator
} from 'lucide-react';

import { ModuleNodeShell, type TabDefinition, type ActionDefinition } from './ModuleNodeShell';
import type { BOMModule, BOMLineItemZ } from './types';
import { validateModule } from './types';

interface BOMNodeProps {
  module: BOMModule;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onUpdate?: (updates: Partial<BOMModule>) => void;
  onToggleCollapse?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onViewJSON?: () => void;
  onExportBOM?: () => void;
  onRequestQuotes?: () => void;
  className?: string;
}

interface EditableLineItemProps {
  lineItem: BOMModule['meta']['line_items'][0];
  onUpdate: (updates: Partial<BOMModule['meta']['line_items'][0]>) => void;
  onDelete: () => void;
}

function EditableLineItem({ lineItem, onUpdate, onDelete }: EditableLineItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(lineItem);

  const handleSave = useCallback(() => {
    onUpdate(editData);
    setIsEditing(false);
  }, [editData, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditData(lineItem);
    setIsEditing(false);
  }, [lineItem]);

  const getLifecycleColor = (lifecycle: string) => {
    switch (lifecycle) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'nrnd': return 'text-yellow-600 bg-yellow-50';
      case 'obsolete': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (isEditing) {
    return (
      <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
            <input
              type="text"
              value={editData.ref}
              onChange={(e) => setEditData({ ...editData, ref: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">MPN</label>
            <input
              type="text"
              value={editData.mpn}
              onChange={(e) => setEditData({ ...editData, mpn: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Manufacturer</label>
            <input
              type="text"
              value={editData.manufacturer || ''}
              onChange={(e) => setEditData({ ...editData, manufacturer: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
            <input
              type="number"
              value={editData.quantity}
              onChange={(e) => setEditData({ ...editData, quantity: parseInt(e.target.value) || 1 })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Price</label>
            <input
              type="number"
              step="0.01"
              value={editData.unit_price || ''}
              onChange={(e) => setEditData({ ...editData, unit_price: parseFloat(e.target.value) || undefined })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
            <input
              type="text"
              value={editData.supplier || ''}
              onChange={(e) => setEditData({ ...editData, supplier: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            rows={2}
          />
        </div>

        <div className="flex justify-end space-x-2">
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-2">
            <span className="font-medium text-gray-900">{lineItem.ref}</span>
            <span className={clsx(
              "px-2 py-0.5 text-xs rounded-full",
              getLifecycleColor(lineItem.lifecycle)
            )}>
              {lineItem.lifecycle}
            </span>
          </div>
          
          <div className="text-sm text-gray-600 mb-2">{lineItem.description}</div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">MPN:</span> {lineItem.mpn}
            </div>
            {lineItem.manufacturer && (
              <div>
                <span className="text-gray-500">Mfr:</span> {lineItem.manufacturer}
              </div>
            )}
            <div>
              <span className="text-gray-500">Qty:</span> {lineItem.quantity}
            </div>
            {lineItem.unit_price && (
              <div>
                <span className="text-gray-500">Price:</span> ${lineItem.unit_price.toFixed(2)}
              </div>
            )}
          </div>

          {lineItem.supplier && (
            <div className="text-xs text-gray-500 mt-2">
              <Building2 className="w-3 h-3 inline mr-1" />
              {lineItem.supplier}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Edit line item"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          {lineItem.datasheet_url && (
            <button
              onClick={() => window.open(lineItem.datasheet_url, '_blank')}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="Open datasheet"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete line item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function BOMNode({
  module,
  isSelected = false,
  isCollapsed = false,
  onUpdate,
  onToggleCollapse,
  onDuplicate,
  onDelete,
  onViewJSON,
  onExportBOM,
  onRequestQuotes,
  className
}: BOMNodeProps) {
  const handleUpdateLineItem = useCallback((index: number, updates: Partial<BOMModule['meta']['line_items'][0]>) => {
    if (!onUpdate) return;

    const newLineItems = [...(module?.meta?.line_items || [])];
    newLineItems[index] = { ...newLineItems[index], ...updates };
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        line_items: newLineItems,
        total_items: newLineItems.length
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.line_items, onUpdate]);

  const handleDeleteLineItem = useCallback((index: number) => {
    if (!onUpdate) return;

    const newLineItems = (module?.meta?.line_items || []).filter((_, i) => i !== index);
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        line_items: newLineItems,
        total_items: newLineItems.length
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.line_items, onUpdate]);

  const handleAddLineItem = useCallback(() => {
    if (!onUpdate) return;

    const newLineItem = {
      ref: `R${(module?.meta?.line_items?.length || 0) + 1}`,
      mpn: '',
      description: 'New component',
      quantity: 1,
      currency: 'USD' as const,
      lifecycle: 'unknown' as const
    };

    onUpdate({
      meta: {
        ...(module?.meta || {}),
        line_items: [...(module?.meta?.line_items || []), newLineItem],
        total_items: (module?.meta?.line_items?.length || 0) + 1
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.line_items, onUpdate]);

  // Calculate summary stats
  const totalItems = module?.meta?.line_items?.length || 0;
  const totalCost = (module?.meta?.line_items || []).reduce((sum, item) => 
    sum + (item.unit_price || 0) * item.quantity, 0
  );
  const readinessPercent = module?.meta?.readiness_percent || 0;
  const uniqueVendors = Object.keys(module?.meta?.vendor_distribution || {}).length;

  const tabs: TabDefinition[] = [
    {
      id: 'summary',
      label: 'Summary',
      icon: <Package className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{totalItems}</div>
              <div className="text-sm text-gray-600">Total Items</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">${totalCost.toFixed(2)}</div>
              <div className="text-sm text-gray-600">Estimated Cost</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{Math.round(readinessPercent)}%</div>
              <div className="text-sm text-gray-600">Readiness</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">{uniqueVendors}</div>
              <div className="text-sm text-gray-600">Vendors</div>
            </div>
          </div>

          {/* Readiness Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">BOM Readiness</span>
              <span className="text-sm text-gray-600">{Math.round(readinessPercent)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${readinessPercent}%` }}
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onExportBOM}
              disabled={!onExportBOM}
              className="flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-4 h-4 mr-2" />
              Export BOM
            </button>
            <button
              onClick={onRequestQuotes}
              disabled={!onRequestQuotes}
              className="flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              Request Quotes
            </button>
          </div>

          {/* Last Updated */}
          {module?.meta?.last_costed && (
            <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
              <Clock className="w-3 h-3 inline mr-1" />
              Last costed: {new Date(module?.meta?.last_costed || '').toLocaleDateString()}
            </div>
          )}
        </div>
      )
    },
    {
      id: 'line_items',
      label: 'Line Items',
      icon: <Package className="w-4 h-4" />,
      badge: totalItems || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-gray-700">Components ({totalItems})</h5>
            <button
              onClick={handleAddLineItem}
              className="flex items-center px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </button>
          </div>

          {totalItems > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(module?.meta?.line_items || []).map((lineItem, index) => (
                <EditableLineItem
                  key={`${lineItem.ref}-${index}`}
                  lineItem={lineItem}
                  onUpdate={(updates) => handleUpdateLineItem(index, updates)}
                  onDelete={() => handleDeleteLineItem(index)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No components in BOM</p>
              <button
                onClick={handleAddLineItem}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700"
              >
                Add your first component
              </button>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'costing',
      label: 'Costing',
      icon: <Calculator className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          {module?.meta?.costing ? (
            <>
              {/* Cost Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      ${(module?.meta?.costing?.total_cost || totalCost).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-600">Total Cost</div>
                  </div>
                  {module?.meta?.costing?.target_cost && (
                    <div>
                      <div className="text-lg font-semibold text-blue-600">
                        ${module?.meta?.costing?.target_cost?.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-600">Target Cost</div>
                    </div>
                  )}
                </div>

                {module?.meta?.costing?.cost_variance && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-center">
                      <span className={clsx(
                        "text-sm font-medium",
                        (module?.meta?.costing?.cost_variance || 0) > 0 ? "text-red-600" : "text-green-600"
                      )}>
                        {(module?.meta?.costing?.cost_variance || 0) > 0 ? '+' : ''}
                        ${(module?.meta?.costing?.cost_variance || 0).toFixed(2)} variance
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Breaks */}
              {(module?.meta?.costing?.price_breaks?.length || 0) > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Volume Pricing</h5>
                  <div className="space-y-2">
                    {(module?.meta?.costing?.price_breaks || []).map((priceBreak, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">{priceBreak.quantity}+ units</span>
                        <span className="text-sm font-medium text-gray-900">
                          ${priceBreak.unit_price.toFixed(2)} each
                        </span>
                        <span className="text-sm text-blue-600">
                          ${priceBreak.total_price.toFixed(2)} total
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Calculator className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No costing data available</p>
              <p className="text-xs text-gray-400 mt-1">
                Add pricing to components to see cost analysis
              </p>
            </div>
          )}

          {/* Cost Breakdown by Vendor */}
          {Object.keys(module?.meta?.vendor_distribution || {}).length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Vendor Distribution</h5>
              <div className="space-y-1">
                {Object.entries(module?.meta?.vendor_distribution || {}).map(([vendor, count]) => (
                  <div key={vendor} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{vendor}</span>
                    <span className="text-gray-600">{count} items</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }
  ];

  const rightActions: ActionDefinition[] = [
    {
      id: 'export',
      label: 'Export BOM',
      icon: <FileText className="w-4 h-4" />,
      onClick: onExportBOM || (() => {}),
      disabled: !onExportBOM,
      variant: 'primary'
    },
    {
      id: 'quotes',
      label: 'Request quotes',
      icon: <DollarSign className="w-4 h-4" />,
      onClick: onRequestQuotes || (() => {}),
      disabled: !onRequestQuotes
    }
  ];

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
      defaultTab="summary"
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

export default BOMNode;