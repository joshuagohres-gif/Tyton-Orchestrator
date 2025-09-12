// components/nodes/ModuleNodeShell.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { 
  MoreVertical, 
  Copy, 
  Trash2, 
  Minimize2, 
  FileText,
  ChevronDown,
  Settings,
  AlertTriangle,
  Clock,
  CheckCircle2
} from 'lucide-react';

import type { Module, ModuleKind } from './types';
import { StatusColors, KindColors } from './types';

export interface TabDefinition {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  badge?: string | number;
}

export interface ActionDefinition {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'primary';
  disabled?: boolean;
}

interface ModuleNodeShellProps {
  module: Module;
  tabs: TabDefinition[];
  defaultTab?: string;
  rightActions?: ActionDefinition[];
  footer?: React.ReactNode;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onViewJSON?: () => void;
  className?: string;
}

const nodeVariants = cva(
  "relative bg-white border-2 rounded-lg shadow-sm transition-all duration-200 min-w-[320px] max-w-[480px]",
  {
    variants: {
      selected: {
        true: "ring-2 ring-blue-500 ring-offset-2 shadow-lg",
        false: "hover:shadow-md"
      },
      kind: {
        electronics: "border-purple-200 hover:border-purple-300",
        mechanical: "border-orange-200 hover:border-orange-300",
        bom: "border-emerald-200 hover:border-emerald-300",
        sourcing: "border-blue-200 hover:border-blue-300"
      }
    },
    defaultVariants: {
      selected: false,
      kind: "electronics"
    }
  }
);

const statusVariants = cva(
  "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border",
  {
    variants: {
      status: {
        draft: "bg-gray-100 text-gray-800 border-gray-200",
        in_progress: "bg-blue-100 text-blue-800 border-blue-200",
        blocked: "bg-red-100 text-red-800 border-red-200",
        ready: "bg-green-100 text-green-800 border-green-200"
      }
    }
  }
);

const getStatusIcon = (status: Module['status']) => {
  switch (status) {
    case 'draft':
      return <FileText className="w-3 h-3 mr-1" />;
    case 'in_progress':
      return <Clock className="w-3 h-3 mr-1" />;
    case 'blocked':
      return <AlertTriangle className="w-3 h-3 mr-1" />;
    case 'ready':
      return <CheckCircle2 className="w-3 h-3 mr-1" />;
  }
};

export function ModuleNodeShell({
  module,
  tabs,
  defaultTab,
  rightActions = [],
  footer,
  isSelected = false,
  isCollapsed = false,
  onToggleCollapse,
  onDuplicate,
  onDelete,
  onViewJSON,
  className
}: ModuleNodeShellProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || '');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const currentTab = tabs.find(tab => tab.id === activeTab);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!nodeRef.current?.contains(document.activeElement)) return;
      
      switch (event.key) {
        case 'Enter':
          event.preventDefault();
          // Focus first interactive element in active tab
          const firstInput = nodeRef.current?.querySelector('input, button, [tabindex="0"]') as HTMLElement;
          firstInput?.focus();
          break;
        case '[':
          event.preventDefault();
          // Previous tab
          const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
          const prevTab = tabs[currentIndex - 1] || tabs[tabs.length - 1];
          setActiveTab(prevTab.id);
          break;
        case ']':
          event.preventDefault();
          // Next tab
          const nextIndex = tabs.findIndex(tab => tab.id === activeTab);
          const nextTab = tabs[nextIndex + 1] || tabs[0];
          setActiveTab(nextTab.id);
          break;
        case 'Delete':
          if (event.target === nodeRef.current && onDelete) {
            event.preventDefault();
            onDelete();
          }
          break;
        case 'f':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            nodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          break;
      }
    }
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, tabs, onDelete]);

  const defaultActions: ActionDefinition[] = [
    ...(onDuplicate ? [{
      id: 'duplicate',
      label: 'Duplicate',
      icon: <Copy className="w-4 h-4" />,
      onClick: onDuplicate
    }] : []),
    ...(onDelete ? [{
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className="w-4 h-4" />,
      onClick: onDelete,
      variant: 'destructive' as const
    }] : []),
    ...(onToggleCollapse ? [{
      id: 'collapse',
      label: isCollapsed ? 'Expand' : 'Collapse',
      icon: <Minimize2 className="w-4 h-4" />,
      onClick: onToggleCollapse
    }] : []),
    ...(onViewJSON ? [{
      id: 'json',
      label: 'View JSON',
      icon: <FileText className="w-4 h-4" />,
      onClick: onViewJSON
    }] : [])
  ];

  const allActions = [...rightActions, ...defaultActions];

  return (
    <div
      ref={nodeRef}
      tabIndex={0}
      role="region"
      aria-label={`${module?.kind || 'Unknown'} module: ${module?.title || 'Untitled'}`}
      className={clsx(
        nodeVariants({ selected: isSelected, kind: module?.kind || 'default' }),
        className
      )}
    >
      {/* Header */}
      <div className={clsx(
        "flex items-center justify-between p-3 border-b",
        KindColors[module?.kind || 'default']
      )}>
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">
              {module?.title || 'Untitled'}
            </h3>
            <div className="flex items-center space-x-2 mt-1">
              <span className={clsx(statusVariants({ status: module?.status || 'draft' }))}>
                {getStatusIcon(module?.status || 'draft')}
                {(module?.status || 'draft').replace('_', ' ')}
              </span>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                {module?.kind || 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 ml-2">
          {rightActions.slice(0, 2).map((action) => (
            <button
              key={action.id}
              onClick={action.onClick}
              disabled={action.disabled}
              className={clsx(
                "p-1.5 rounded-md transition-colors",
                action.disabled
                  ? "text-gray-400 cursor-not-allowed"
                  : action.variant === 'primary'
                  ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  : action.variant === 'destructive'
                  ? "text-red-600 hover:text-red-700 hover:bg-red-50"
                  : "text-gray-600 hover:text-gray-700 hover:bg-gray-50"
              )}
              title={action.label}
              aria-label={action.label}
            >
              {action.icon}
            </button>
          ))}

          {allActions.length > 0 && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-md text-gray-600 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                aria-label="More actions"
                aria-expanded={showMenu}
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                  {allActions.map((action, index) => (
                    <button
                      key={action.id}
                      onClick={() => {
                        action.onClick();
                        setShowMenu(false);
                      }}
                      disabled={action.disabled}
                      className={clsx(
                        "w-full flex items-center px-3 py-2 text-sm text-left transition-colors",
                        index > 0 && "border-t border-gray-100",
                        action.disabled
                          ? "text-gray-400 cursor-not-allowed"
                          : action.variant === 'destructive'
                          ? "text-red-600 hover:bg-red-50"
                          : "text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {action.icon && <span className="mr-2">{action.icon}</span>}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Tabs */}
          {tabs.length > 1 && (
            <div className="border-b border-gray-200">
              <nav className="flex space-x-0" aria-label="Tabs" role="tablist">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      "flex items-center px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                      activeTab === tab.id
                        ? "border-blue-500 text-blue-600 bg-blue-50"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    )}
                  >
                    {tab.icon && <span className="mr-2">{tab.icon}</span>}
                    {tab.label}
                    {tab.badge && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Tab Content */}
          <div className="p-4">
            {currentTab && (
              <div
                id={`panel-${currentTab.id}`}
                role="tabpanel"
                aria-labelledby={`tab-${currentTab.id}`}
              >
                {currentTab.content}
              </div>
            )}
          </div>

          {/* Footer */}
          {footer && (
            <div className="border-t border-gray-200 p-3 bg-gray-50 rounded-b-lg">
              {footer}
            </div>
          )}
        </>
      )}

      {/* Tags */}
      {module?.tags && module?.tags.length > 0 && (
        <div className="absolute -top-2 left-3 flex space-x-1">
          {module?.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {tag}
            </span>
          ))}
          {module?.tags && module?.tags.length > 3 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              +{module?.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}