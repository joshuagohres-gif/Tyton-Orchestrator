"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { EdaCollaborationManager, CollaborationUser, CollaborationState } from '@/server/eda/collaboration/yjs';
import type { EdaSpecV1 } from '@/server/eda/specs/edaSpecV10';

interface UseEdaCollaborationProps {
  projectId: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  websocketUrl?: string;
  enabled?: boolean;
}

interface UseEdaCollaborationReturn {
  // Collaboration state
  collaborationState: CollaborationState;
  manager: EdaCollaborationManager | null;
  isConnected: boolean;
  activeUsers: CollaborationUser[];
  
  // EDA data
  edaSpec: EdaSpecV1 | null;
  placement: any[];
  netlist: any;
  validation: any;
  comments: any[];
  history: any[];
  
  // Actions
  updateSpec: (spec: EdaSpecV1, path?: string[]) => void;
  updatePlacement: (placement: any[]) => void;
  updateComponentPosition: (componentRef: string, x: number, y: number) => void;
  addComment: (comment: { text: string; x: number; y: number; componentRef?: string; netName?: string }) => void;
  updateCursor: (x: number, y: number) => void;
  updateSelection: (selection: { componentId?: string; netName?: string; pinId?: string }) => void;
  createSnapshot: () => any;
  restoreSnapshot: (snapshot: any) => void;
  
  // Status
  lastSync: Date | null;
  connectionError: string | null;
}

export function useEdaCollaboration({
  projectId,
  user,
  websocketUrl,
  enabled = true
}: UseEdaCollaborationProps): UseEdaCollaborationReturn {
  const [manager, setManager] = useState<EdaCollaborationManager | null>(null);
  const [collaborationState, setCollaborationState] = useState<CollaborationState>({
    users: new Map(),
    activeUsers: 0,
    connectionState: 'disconnected',
    lastSync: new Date()
  });
  
  const [edaSpec, setEdaSpec] = useState<EdaSpecV1 | null>(null);
  const [placement, setPlacement] = useState<any[]>([]);
  const [netlist, setNetlist] = useState<any>({});
  const [validation, setValidation] = useState<any>({});
  const [comments, setComments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const managerRef = useRef<EdaCollaborationManager | null>(null);

  // Initialize collaboration manager
  useEffect(() => {
    if (!enabled || !projectId || !user.id) return;

    const collaborationUser: CollaborationUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      color: generateUserColor(user.id)
    };

    const roomId = `eda-project-${projectId}`;
    const wsUrl = websocketUrl || process.env.NEXT_PUBLIC_COLLABORATION_WS_URL;

    try {
      const newManager = new EdaCollaborationManager(
        roomId,
        user.id,
        collaborationUser,
        wsUrl
      );

      // Setup event listeners
      newManager.on('connection-changed', (state: string) => {
        setCollaborationState(prev => ({ ...prev, connectionState: state as any }));
        if (state === 'connected') {
          setConnectionError(null);
        }
      });

      newManager.on('users-changed', (data: { users: CollaborationUser[]; activeUsers: number }) => {
        setCollaborationState(prev => ({
          ...prev,
          users: new Map(data.users.map(u => [Math.random(), u])), // Note: simplified key
          activeUsers: data.activeUsers
        }));
      });

      newManager.on('spec-changed', (spec: EdaSpecV1) => {
        setEdaSpec(spec);
      });

      newManager.on('placement-changed', (newPlacement: any[]) => {
        setPlacement(newPlacement);
      });

      newManager.on('netlist-changed', (newNetlist: any) => {
        setNetlist(newNetlist);
      });

      newManager.on('validation-changed', (newValidation: any) => {
        setValidation(newValidation);
      });

      newManager.on('comments-changed', (newComments: any[]) => {
        setComments(newComments);
      });

      newManager.on('sync', (syncTime: Date) => {
        setLastSync(syncTime);
      });

      setManager(newManager);
      managerRef.current = newManager;

      // Load initial data
      setEdaSpec(newManager.getEdaSpec());
      setPlacement(newManager.getPlacement());
      setNetlist(newManager.getNetlist());
      setValidation(newManager.getValidation());
      setComments(newManager.getComments());
      setHistory(newManager.getHistory());
      setCollaborationState(newManager.getCollaborationState());

    } catch (error) {
      console.error('Failed to initialize collaboration:', error);
      setConnectionError(error instanceof Error ? error.message : 'Collaboration initialization failed');
    }

    // Cleanup on unmount
    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, [projectId, user.id, user.name, user.email, enabled, websocketUrl]);

  // Actions
  const updateSpec = useCallback((spec: EdaSpecV1, path?: string[]) => {
    if (manager) {
      manager.updateEdaSpec(spec, path);
    }
  }, [manager]);

  const updatePlacement = useCallback((newPlacement: any[]) => {
    if (manager) {
      manager.updatePlacement(newPlacement);
    }
  }, [manager]);

  const updateComponentPosition = useCallback((componentRef: string, x: number, y: number) => {
    if (manager) {
      manager.updateComponentPosition(componentRef, x, y);
    }
  }, [manager]);

  const addComment = useCallback((comment: {
    text: string;
    x: number;
    y: number;
    componentRef?: string;
    netName?: string;
  }) => {
    if (manager) {
      const fullComment = {
        id: Math.random().toString(36).substr(2, 9),
        ...comment,
        author: user.id,
        timestamp: Date.now()
      };
      manager.addComment(fullComment);
    }
  }, [manager, user.id]);

  const updateCursor = useCallback((x: number, y: number) => {
    if (manager) {
      manager.updateCursor(x, y);
    }
  }, [manager]);

  const updateSelection = useCallback((selection: {
    componentId?: string;
    netName?: string;
    pinId?: string;
  }) => {
    if (manager) {
      manager.updateSelection(selection);
    }
  }, [manager]);

  const createSnapshot = useCallback(() => {
    if (manager) {
      return manager.createSnapshot();
    }
    return null;
  }, [manager]);

  const restoreSnapshot = useCallback((snapshot: any) => {
    if (manager) {
      manager.restoreSnapshot(snapshot);
    }
  }, [manager]);

  // Derived state
  const isConnected = collaborationState.connectionState === 'connected';
  const activeUsers = Array.from(collaborationState.users.values());

  return {
    // Collaboration state
    collaborationState,
    manager,
    isConnected,
    activeUsers,
    
    // EDA data
    edaSpec,
    placement,
    netlist,
    validation,
    comments,
    history,
    
    // Actions
    updateSpec,
    updatePlacement,
    updateComponentPosition,
    addComment,
    updateCursor,
    updateSelection,
    createSnapshot,
    restoreSnapshot,
    
    // Status
    lastSync,
    connectionError
  };
}

// Helper functions
function generateUserColor(userId: string): string {
  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#06b6d4', '#84cc16', '#f97316',
    '#ec4899', '#6366f1', '#14b8a6', '#eab308'
  ];
  
  // Generate consistent color based on user ID
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Hook for collaborative cursors in circuit panel
 */
export function useCollaborativeCursors(
  collaborationManager: EdaCollaborationManager | null,
  containerRef: React.RefObject<HTMLDivElement>
) {
  const [cursors, setCursors] = useState<Map<string, { x: number; y: number; user: CollaborationUser }>>(new Map());

  useEffect(() => {
    if (!collaborationManager || !containerRef.current) return;

    const updateCursors = () => {
      const newCursors = new Map();
      const users = collaborationManager.getCollaborationState().users;
      
      users.forEach((user, clientId) => {
        if (user.cursor && user.id !== collaborationManager['userId']) {
          newCursors.set(user.id, {
            x: user.cursor.x,
            y: user.cursor.y,
            user
          });
        }
      });
      
      setCursors(newCursors);
    };

    collaborationManager.on('users-changed', updateCursors);
    updateCursors();

    // Track local mouse movement
    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      collaborationManager.updateCursor(x, y);
    };

    const container = containerRef.current;
    container.addEventListener('mousemove', handleMouseMove);

    return () => {
      collaborationManager.off('users-changed', updateCursors);
      container?.removeEventListener('mousemove', handleMouseMove);
    };
  }, [collaborationManager, containerRef]);

  return cursors;
}

/**
 * Hook for collaborative selections
 */
export function useCollaborativeSelection(
  collaborationManager: EdaCollaborationManager | null
) {
  const [selections, setSelections] = useState<Map<string, { selection: any; user: CollaborationUser }>>(new Map());

  useEffect(() => {
    if (!collaborationManager) return;

    const updateSelections = () => {
      const newSelections = new Map();
      const users = collaborationManager.getCollaborationState().users;
      
      users.forEach((user, clientId) => {
        if (user.selection && user.id !== collaborationManager['userId']) {
          newSelections.set(user.id, {
            selection: user.selection,
            user
          });
        }
      });
      
      setSelections(newSelections);
    };

    collaborationManager.on('users-changed', updateSelections);
    updateSelections();

    return () => {
      collaborationManager.off('users-changed', updateSelections);
    };
  }, [collaborationManager]);

  return selections;
}