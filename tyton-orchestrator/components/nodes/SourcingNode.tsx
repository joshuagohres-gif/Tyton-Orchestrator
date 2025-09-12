// components/nodes/SourcingNode.tsx
"use client";

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { 
  ShoppingCart, 
  Building2, 
  Package, 
  AlertTriangle, 
  Plus, 
  Edit3, 
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  Star,
  Phone,
  Mail,
  Shuffle
} from 'lucide-react';

import { ModuleNodeShell, type TabDefinition, type ActionDefinition } from './ModuleNodeShell';
import type { SourcingModule, SourcingVendorZ, SourcingStockZ } from './types';
import { validateModule } from './types';

interface SourcingNodeProps {
  module: SourcingModule;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onUpdate?: (updates: Partial<SourcingModule>) => void;
  onToggleCollapse?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onViewJSON?: () => void;
  onRequestQuotes?: () => void;
  onCheckAvailability?: () => void;
  className?: string;
}

interface EditableVendorProps {
  vendor: SourcingModule['meta']['vendors'][0];
  onUpdate: (updates: Partial<SourcingModule['meta']['vendors'][0]>) => void;
  onDelete: () => void;
  isPreferred?: boolean;
}

function EditableVendor({ vendor, onUpdate, onDelete, isPreferred }: EditableVendorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(vendor);

  const handleSave = useCallback(() => {
    onUpdate(editData);
    setIsEditing(false);
  }, [editData, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditData(vendor);
    setIsEditing(false);
  }, [vendor]);

  if (isEditing) {
    return (
      <div className="border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vendor Name</label>
            <input
              type="text"
              value={editData.name}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact</label>
            <input
              type="text"
              value={editData.contact || ''}
              onChange={(e) => setEditData({ ...editData, contact: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quote Reference</label>
            <input
              type="text"
              value={editData.quote_ref || ''}
              onChange={(e) => setEditData({ ...editData, quote_ref: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Price</label>
            <input
              type="number"
              step="0.01"
              value={editData.price || ''}
              onChange={(e) => setEditData({ ...editData, price: parseFloat(e.target.value) || undefined })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">MOQ</label>
            <input
              type="number"
              value={editData.moq || ''}
              onChange={(e) => setEditData({ ...editData, moq: parseInt(e.target.value) || undefined })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Lead Time (days)</label>
            <input
              type="number"
              value={editData.lead_time_days || ''}
              onChange={(e) => setEditData({ ...editData, lead_time_days: parseInt(e.target.value) || undefined })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={editData.notes || ''}
            onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
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
            <span className="font-medium text-gray-900">{vendor.name}</span>
            {isPreferred && (
              <Star className="w-4 h-4 text-yellow-500" title="Preferred vendor" />
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            {vendor.price && (
              <div>
                <span className="text-gray-500">Price:</span> ${vendor.price.toFixed(2)}
              </div>
            )}
            {vendor.moq && (
              <div>
                <span className="text-gray-500">MOQ:</span> {vendor.moq}
              </div>
            )}
            {vendor.lead_time_days && (
              <div>
                <span className="text-gray-500">Lead Time:</span> {vendor.lead_time_days}d
              </div>
            )}
            {vendor.quote_ref && (
              <div>
                <span className="text-gray-500">Quote:</span> {vendor.quote_ref}
              </div>
            )}
          </div>

          {vendor.contact && (
            <div className="text-xs text-gray-500 mt-2">
              <Mail className="w-3 h-3 inline mr-1" />
              {vendor.contact}
            </div>
          )}

          {vendor.valid_until && (
            <div className="text-xs text-gray-500 mt-1">
              <Clock className="w-3 h-3 inline mr-1" />
              Valid until: {new Date(vendor.valid_until).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Edit vendor"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Delete vendor"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface StockItemProps {
  stockItem: SourcingModule['meta']['stock_status'][0];
  onUpdate: (updates: Partial<SourcingModule['meta']['stock_status'][0]>) => void;
}

function StockItem({ stockItem, onUpdate }: StockItemProps) {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';  
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'critical': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const shortageQty = Math.max(0, stockItem.required_qty - stockItem.available_qty);

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900">{stockItem.mpn}</span>
        <span className={clsx(
          "px-2 py-0.5 text-xs rounded-full",
          getRiskColor(stockItem.risk_level)
        )}>
          {stockItem.risk_level} risk
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm mb-2">
        <div>
          <span className="text-gray-500">Available:</span> {stockItem.available_qty}
        </div>
        <div>
          <span className="text-gray-500">Required:</span> {stockItem.required_qty}
        </div>
      </div>

      {shortageQty > 0 && (
        <div className="text-sm text-red-600 mb-2">
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          Shortage: {shortageQty} units
        </div>
      )}

      {stockItem.alternates.length > 0 && (
        <div className="text-xs text-gray-500">
          <Shuffle className="w-3 h-3 inline mr-1" />
          {stockItem.alternates.length} alternate{stockItem.alternates.length > 1 ? 's' : ''}
        </div>
      )}

      {stockItem.last_checked && (
        <div className="text-xs text-gray-500 mt-1">
          Last checked: {new Date(stockItem.last_checked).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

export function SourcingNode({
  module,
  isSelected = false,
  isCollapsed = false,
  onUpdate,
  onToggleCollapse,
  onDuplicate,
  onDelete,
  onViewJSON,
  onRequestQuotes,
  onCheckAvailability,
  className
}: SourcingNodeProps) {
  const handleUpdateVendor = useCallback((index: number, updates: Partial<SourcingModule['meta']['vendors'][0]>) => {
    if (!onUpdate) return;

    const newVendors = [...(module?.meta?.vendors || [])];
    newVendors[index] = { ...newVendors[index], ...updates };
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        vendors: newVendors,
        total_quotes: newVendors.filter(v => v.quote_ref).length
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.vendors, onUpdate]);

  const handleDeleteVendor = useCallback((index: number) => {
    if (!onUpdate) return;

    const newVendors = (module?.meta?.vendors || []).filter((_, i) => i !== index);
    
    onUpdate({
      meta: {
        ...(module?.meta || {}),
        vendors: newVendors,
        total_quotes: newVendors.filter(v => v.quote_ref).length
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.vendors, onUpdate]);

  const handleAddVendor = useCallback(() => {
    if (!onUpdate) return;

    const newVendor = {
      name: 'New Vendor',
      currency: 'USD' as const
    };

    onUpdate({
      meta: {
        ...(module?.meta || {}),
        vendors: [...(module?.meta?.vendors || []), newVendor]
      },
      updatedAt: new Date().toISOString()
    });
  }, [module?.meta?.vendors, onUpdate]);

  // Calculate summary stats
  const totalVendors = module?.meta?.vendors?.length || 0;
  const totalQuotes = module?.meta?.total_quotes || 0;
  const highRiskParts = module?.meta?.high_risk_parts || 0;
  const totalParts = module?.meta?.stock_status?.length || 0;

  const tabs: TabDefinition[] = [
    {
      id: 'vendors',
      label: 'Vendors',
      icon: <Building2 className="w-4 h-4" />,
      badge: totalVendors || undefined,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-medium text-gray-700">Vendors ({totalVendors})</h5>
            <button
              onClick={handleAddVendor}
              className="flex items-center px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Vendor
            </button>
          </div>

          {totalVendors > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(module?.meta?.vendors || []).map((vendor, index) => (
                <EditableVendor
                  key={`${vendor.name}-${index}`}
                  vendor={vendor}
                  onUpdate={(updates) => handleUpdateVendor(index, updates)}
                  onDelete={() => handleDeleteVendor(index)}
                  isPreferred={(module?.meta?.preferred_vendors || []).includes(vendor.name)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No vendors configured</p>
              <button
                onClick={handleAddVendor}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700"
              >
                Add your first vendor
              </button>
            </div>
          )}

          {/* Preferred Vendors */}
          {(module?.meta?.preferred_vendors?.length || 0) > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <h6 className="text-xs font-medium text-gray-700 mb-2">Preferred Vendors</h6>
              <div className="flex flex-wrap gap-1">
                {(module?.meta?.preferred_vendors || []).map((vendorName) => (
                  <span
                    key={vendorName}
                    className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full"
                  >
                    <Star className="w-3 h-3 mr-1" />
                    {vendorName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'stock',
      label: 'Stock',
      icon: <Package className="w-4 h-4" />,
      badge: highRiskParts > 0 ? highRiskParts : undefined,
      content: (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-gray-900">{totalParts}</div>
              <div className="text-xs text-gray-600">Parts Tracked</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-red-600">{highRiskParts}</div>
              <div className="text-xs text-gray-600">High Risk</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-blue-600">{totalQuotes}</div>
              <div className="text-xs text-gray-600">Active Quotes</div>
            </div>
          </div>

          {/* Stock Status */}
          {totalParts > 0 ? (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Stock Status</h5>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(module?.meta?.stock_status || []).map((stockItem, index) => (
                  <StockItem
                    key={`${stockItem.mpn}-${index}`}
                    stockItem={stockItem}
                    onUpdate={(updates) => {
                      if (!onUpdate) return;
                      const newStock = [...(module?.meta?.stock_status || [])];
                      newStock[index] = { ...newStock[index], ...updates };
                      onUpdate({
                        meta: { ...(module?.meta || {}), stock_status: newStock },
                        updatedAt: new Date().toISOString()
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No parts being tracked</p>
              <p className="text-xs text-gray-400 mt-1">
                Stock tracking will appear here when parts are added
              </p>
            </div>
          )}

          {/* Quick Action */}
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onCheckAvailability}
              disabled={!onCheckAvailability || totalParts === 0}
              className="w-full flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Check Availability
            </button>
          </div>
        </div>
      )
    },
    {
      id: 'alternates',
      label: 'Alternates',
      icon: <Shuffle className="w-4 h-4" />,
      content: (
        <div className="space-y-4">
          {/* Alternates by Part */}
          {(module?.meta?.stock_status || []).some(s => s.alternates.length > 0) ? (
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Alternative Parts</h5>
              <div className="space-y-3">
                {(module?.meta?.stock_status || [])
                  .filter(stock => stock.alternates.length > 0)
                  .map((stock, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-gray-900 mb-2">{stock.mpn}</div>
                      <div className="space-y-1">
                        {stock.alternates.map((alt, altIndex) => (
                          <div key={altIndex} className="flex items-center justify-between text-sm">
                            <div className="flex items-center space-x-2">
                              <span className="text-gray-700">{alt.mpn}</span>
                              {alt.drop_in && (
                                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                                  Drop-in
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">{alt.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Shuffle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No alternate parts defined</p>
              <p className="text-xs text-gray-400 mt-1">
                Alternates help mitigate supply chain risks
              </p>
            </div>
          )}

          {/* Risk Mitigation Summary */}
          <div className="pt-4 border-t border-gray-200">
            <h6 className="text-xs font-medium text-gray-700 mb-2">Risk Mitigation</h6>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-green-50 rounded p-2">
                <div className="text-sm font-semibold text-green-600">
                  {(module?.meta?.stock_status || []).filter(s => s.alternates.some(a => a.drop_in)).length}
                </div>
                <div className="text-xs text-gray-600">Drop-in Ready</div>
              </div>
              <div className="bg-yellow-50 rounded p-2">
                <div className="text-sm font-semibold text-yellow-600">
                  {(module?.meta?.stock_status || []).filter(s => s.alternates.length > 0 && !s.alternates.some(a => a.drop_in)).length}
                </div>
                <div className="text-xs text-gray-600">Requires Validation</div>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const rightActions: ActionDefinition[] = [
    {
      id: 'quotes',
      label: 'Request quotes',
      icon: <DollarSign className="w-4 h-4" />,
      onClick: onRequestQuotes || (() => {}),
      disabled: !onRequestQuotes || totalVendors === 0,
      variant: 'primary'
    },
    {
      id: 'check-stock',
      label: 'Check availability',
      icon: <TrendingUp className="w-4 h-4" />,
      onClick: onCheckAvailability || (() => {}),
      disabled: !onCheckAvailability || totalParts === 0
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
      defaultTab="vendors"
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

export default SourcingNode;