'use client';

import React, { useState } from 'react';
import { X, ShoppingCart, ExternalLink, Globe, FileText, Package, AlertCircle } from 'lucide-react';

interface SupplierLink {
  id: string;
  partNumber: string;
  supplier: string;
  availability: string | null;
  datasheetUrl: string | null;
  purchaseUrl: string | null;
  altPartsJson: string | null;
}

interface SourcingModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: SupplierLink[];
  projectTitle: string;
}

export default function SourcingModal({ isOpen, onClose, suppliers, projectTitle }: SourcingModalProps) {
  const [selectedPart, setSelectedPart] = useState<string | null>(null);

  if (!isOpen) return null;

  // Group suppliers by part number
  const groupedSuppliers = suppliers.reduce((acc, supplier) => {
    if (!acc[supplier.partNumber]) {
      acc[supplier.partNumber] = [];
    }
    acc[supplier.partNumber].push(supplier);
    return acc;
  }, {} as Record<string, SupplierLink[]>);

  // Get unique suppliers
  const uniqueSuppliers = [...new Set(suppliers.map(s => s.supplier))];

  return (
    <div className="fixed inset-0 bg-tyton-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-tyton-white border-4 border-tyton-gold rounded-lg max-w-5xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="bg-tyton-black border-b-2 border-tyton-gold px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-tyton-gold" />
            <div>
              <h2 className="text-xl font-bold text-tyton-gold">Sourcing & Suppliers</h2>
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

        {/* Supplier Summary */}
        {suppliers.length > 0 && (
          <div className="bg-tyton-gray-warm border-b-2 border-tyton-gold px-6 py-3">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-tyton-black">Suppliers:</span>
              <div className="flex flex-wrap gap-2">
                {uniqueSuppliers.map((supplier) => (
                  <span key={supplier} className="px-2 py-1 bg-tyton-gold text-tyton-black text-xs font-medium rounded">
                    {supplier}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-200px)] p-6">
          {suppliers.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-12 h-12 text-tyton-gold mx-auto mb-3" />
              <p className="text-tyton-black">No sourcing information available yet</p>
              <p className="text-sm text-tyton-black-soft mt-2">
                Run the Sourcing stage to find suppliers and purchase links
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedSuppliers).map(([partNumber, partSuppliers]) => {
                const isExpanded = selectedPart === partNumber;
                const hasDatasheet = partSuppliers.some(s => s.datasheetUrl);
                const alternatives = partSuppliers[0]?.altPartsJson ? 
                  JSON.parse(partSuppliers[0].altPartsJson) : null;

                return (
                  <div key={partNumber} className="border-2 border-tyton-gold rounded-lg overflow-hidden">
                    <button
                      onClick={() => setSelectedPart(isExpanded ? null : partNumber)}
                      className="w-full px-4 py-3 bg-tyton-black text-left hover:bg-tyton-black-soft transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Package className="w-5 h-5 text-tyton-gold" />
                          <div>
                            <span className="font-mono text-tyton-gold font-semibold">{partNumber}</span>
                            <span className="text-tyton-gold-light text-sm ml-3">
                              {partSuppliers.length} supplier{partSuppliers.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasDatasheet && (
                            <FileText className="w-4 h-4 text-tyton-gold" title="Datasheet available" />
                          )}
                          <span className="text-tyton-gold">
                            {isExpanded ? '−' : '+'}
                          </span>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="bg-tyton-white p-4 space-y-4">
                        {/* Suppliers for this part */}
                        <div className="space-y-3">
                          {partSuppliers.map((supplier) => (
                            <div key={supplier.id} className="border border-tyton-gold rounded-lg p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Globe className="w-4 h-4 text-tyton-gold" />
                                    <span className="font-medium text-tyton-black">{supplier.supplier}</span>
                                    {supplier.availability && (
                                      <span className={`text-xs px-2 py-1 rounded ${
                                        supplier.availability.toLowerCase().includes('stock') 
                                          ? 'bg-green-100 text-green-800' 
                                          : 'bg-yellow-100 text-yellow-800'
                                      }`}>
                                        {supplier.availability}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  {supplier.datasheetUrl && (
                                    <a
                                      href={supplier.datasheetUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1 bg-tyton-gray-warm border border-tyton-gold text-tyton-black text-sm rounded hover:bg-tyton-gold-light transition-colors flex items-center gap-1"
                                    >
                                      <FileText className="w-3 h-3" />
                                      Datasheet
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                  {supplier.purchaseUrl && (
                                    <a
                                      href={supplier.purchaseUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1 bg-tyton-gold text-tyton-black font-medium text-sm rounded hover:bg-tyton-gold-light transition-colors flex items-center gap-1"
                                    >
                                      <ShoppingCart className="w-3 h-3" />
                                      Purchase
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Alternative Parts */}
                        {alternatives && alternatives.length > 0 && (
                          <div className="border-t-2 border-tyton-gold pt-3">
                            <h4 className="text-sm font-medium text-tyton-black mb-2 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-tyton-gold" />
                              Alternative Parts
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                              {alternatives.map((alt: any, idx: number) => (
                                <div key={idx} className="bg-tyton-gray-warm px-3 py-2 rounded">
                                  <span className="font-mono text-sm text-tyton-black">{alt.part}</span>
                                  {alt.reason && (
                                    <p className="text-xs text-tyton-black-soft mt-1">{alt.reason}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {suppliers.length > 0 && (
          <div className="border-t-2 border-tyton-gold bg-tyton-black px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-tyton-gold text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Availability and pricing subject to change</span>
              </div>
              <div className="text-tyton-gold text-sm">
                Total Parts: {Object.keys(groupedSuppliers).length}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}