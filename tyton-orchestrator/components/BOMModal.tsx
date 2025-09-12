'use client';

import React from 'react';
import { X, Package, DollarSign, AlertCircle } from 'lucide-react';

interface BOMItem {
  id: string;
  category: string;
  partNumber: string;
  description: string;
  quantity: number;
  unitCost: number | null;
  extendedCost: number | null;
  notes: string | null;
}

interface BOMModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: BOMItem[];
  projectTitle: string;
}

export default function BOMModal({ isOpen, onClose, items, projectTitle }: BOMModalProps) {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + (item.extendedCost || 0), 0);
  const contingency = subtotal * 0.15; // 15% contingency
  const total = subtotal + contingency;

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, BOMItem[]>);

  return (
    <div className="fixed inset-0 bg-tyton-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-tyton-white border-4 border-tyton-gold rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-tyton-black border-b-2 border-tyton-gold px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-tyton-gold" />
            <div>
              <h2 className="text-xl font-bold text-tyton-gold">Bill of Materials</h2>
              <p className="text-sm text-tyton-gold-light">{projectTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-tyton-gold hover:text-tyton-gold-light transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-200px)] p-6">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-tyton-gold mx-auto mb-3" />
              <p className="text-tyton-black">No BOM items generated yet</p>
              <p className="text-sm text-tyton-black-soft mt-2">
                Run the BOM stage to generate a bill of materials
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedItems).map(([category, categoryItems]) => (
                <div key={category} className="border-2 border-tyton-gold rounded-lg overflow-hidden">
                  <div className="bg-tyton-black px-4 py-2">
                    <h3 className="font-semibold text-tyton-gold">{category}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-tyton-gray-warm">
                        <tr>
                          <th className="text-left px-4 py-2 text-sm font-medium text-tyton-black">Part #</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-tyton-black">Description</th>
                          <th className="text-center px-4 py-2 text-sm font-medium text-tyton-black">Qty</th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-tyton-black">Unit Cost</th>
                          <th className="text-right px-4 py-2 text-sm font-medium text-tyton-black">Extended</th>
                          <th className="text-left px-4 py-2 text-sm font-medium text-tyton-black">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryItems.map((item, idx) => (
                          <tr key={item.id} className={idx % 2 === 0 ? 'bg-tyton-white' : 'bg-gray-50'}>
                            <td className="px-4 py-2 text-sm font-mono text-tyton-black">{item.partNumber}</td>
                            <td className="px-4 py-2 text-sm text-tyton-black">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-center text-tyton-black">{item.quantity}</td>
                            <td className="px-4 py-2 text-sm text-right text-tyton-black">
                              {item.unitCost ? `$${item.unitCost.toFixed(2)}` : 'TBD'}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium text-tyton-black">
                              {item.extendedCost ? `$${item.extendedCost.toFixed(2)}` : 'TBD'}
                            </td>
                            <td className="px-4 py-2 text-sm text-tyton-black-soft">{item.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with Totals */}
        {items.length > 0 && (
          <div className="border-t-2 border-tyton-gold bg-tyton-black px-6 py-4">
            <div className="flex justify-between items-end">
              <div className="flex items-center gap-2 text-tyton-gold">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Prices are estimates and may vary</span>
              </div>
              <div className="text-right space-y-1">
                <div className="flex justify-between gap-8 text-sm">
                  <span className="text-tyton-gold">Subtotal:</span>
                  <span className="text-tyton-white font-mono">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-8 text-sm">
                  <span className="text-tyton-gold">Contingency (15%):</span>
                  <span className="text-tyton-white font-mono">${contingency.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-8 text-lg font-bold pt-2 border-t border-tyton-gold">
                  <span className="text-tyton-gold">Total:</span>
                  <span className="text-tyton-gold-light font-mono">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}