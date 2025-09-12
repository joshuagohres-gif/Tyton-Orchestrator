import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { Awareness } from 'y-protocols/awareness';

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  cursor?: {
    x: number;
    y: number;
  };
  selection?: {
    componentId?: string;
    netName?: string;
    pinId?: string;
  };
}

export interface CollaborationState {
  users: Map<number, CollaborationUser>;
  activeUsers: number;
  connectionState: 'connecting' | 'connected' | 'disconnected';
  lastSync: Date;
}

export interface EdaCollaborationData {
  spec: any; // EdaSpecV1 as Yjs document
  placement: Y.Array<any>; // Component placements
  netlist: Y.Map<any>; // Generated netlists
  validation: Y.Map<any>; // ERC/DRC results
  comments: Y.Array<any>; // Design comments/annotations
  history: Y.Array<any>; // Change history
}

/**
 * EDA Collaboration Manager using Yjs
 * Handles real-time collaboration for EDA projects
 */
export class EdaCollaborationManager {
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private awareness: Awareness;
  private roomId: string;
  private userId: string;
  private userData: CollaborationUser;
  private state: CollaborationState;
  private callbacks: Map<string, Function[]> = new Map();

  constructor(roomId: string, userId: string, userData: CollaborationUser, websocketUrl?: string) {
    this.roomId = roomId;
    this.userId = userId;
    this.userData = userData;
    
    // Create Yjs document
    this.doc = new Y.Doc();
    
    // Initialize awareness for user presence
    this.awareness = new Awareness(this.doc);
    
    // Initialize collaboration state
    this.state = {
      users: new Map(),
      activeUsers: 0,
      connectionState: 'connecting',
      lastSync: new Date()
    };
    
    // Setup WebSocket provider if URL provided
    if (websocketUrl) {
      this.provider = new WebsocketProvider(websocketUrl, roomId, this.doc);
      this.setupProviderEvents();
    }
    
    this.setupDocumentStructure();
    this.setupAwarenessEvents();
    this.setupDocumentEvents();
  }

  /**
   * Setup Yjs document structure for EDA data
   */
  private setupDocumentStructure() {
    // Create shared data structures
    const edaData = this.doc.getMap('eda') as Y.Map<any>;
    
    // Initialize if not exists
    if (!edaData.has('spec')) {
      edaData.set('spec', new Y.Map());
    }
    if (!edaData.has('placement')) {
      edaData.set('placement', new Y.Array());
    }
    if (!edaData.has('netlist')) {
      edaData.set('netlist', new Y.Map());
    }
    if (!edaData.has('validation')) {
      edaData.set('validation', new Y.Map());
    }
    if (!edaData.has('comments')) {
      edaData.set('comments', new Y.Array());
    }
    if (!edaData.has('history')) {
      edaData.set('history', new Y.Array());
    }
  }

  /**
   * Setup WebSocket provider events
   */
  private setupProviderEvents() {
    if (!this.provider) return;

    this.provider.on('connection-open', () => {
      this.state.connectionState = 'connected';
      this.state.lastSync = new Date();
      this.emit('connection-changed', this.state.connectionState);
    });

    this.provider.on('connection-close', () => {
      this.state.connectionState = 'disconnected';
      this.emit('connection-changed', this.state.connectionState);
    });

    this.provider.on('sync', () => {
      this.state.lastSync = new Date();
      this.emit('sync', this.state.lastSync);
    });
  }

  /**
   * Setup awareness events for user presence
   */
  private setupAwarenessEvents() {
    // Set local user data
    this.awareness.setLocalState({
      user: this.userData,
      timestamp: Date.now()
    });

    // Listen for awareness changes
    this.awareness.on('change', (changes: any) => {
      const added = Array.from(changes.added) as number[];
      const updated = Array.from(changes.updated) as number[];
      const removed = Array.from(changes.removed) as number[];

      // Process added users
      for (const clientId of added) {
        const state = this.awareness.getStates().get(clientId);
        if (state?.user) {
          this.state.users.set(clientId, state.user);
        }
      }

      // Process updated users
      for (const clientId of updated) {
        const state = this.awareness.getStates().get(clientId);
        if (state?.user) {
          this.state.users.set(clientId, state.user);
        }
      }

      // Process removed users
      for (const clientId of removed) {
        this.state.users.delete(clientId);
      }

      this.state.activeUsers = this.state.users.size;
      this.emit('users-changed', {
        users: Array.from(this.state.users.values()),
        activeUsers: this.state.activeUsers
      });
    });
  }

  /**
   * Setup document change events
   */
  private setupDocumentEvents() {
    const edaData = this.doc.getMap('eda');

    // Listen for EDA spec changes
    const specMap = edaData.get('spec') as Y.Map<any>;
    specMap.observeDeep((events) => {
      this.emit('spec-changed', this.getEdaSpec());
      this.addToHistory('spec-updated', { events, timestamp: Date.now() });
    });

    // Listen for placement changes
    const placementArray = edaData.get('placement') as Y.Array<any>;
    placementArray.observeDeep((events) => {
      this.emit('placement-changed', this.getPlacement());
      this.addToHistory('placement-updated', { events, timestamp: Date.now() });
    });

    // Listen for netlist changes
    const netlistMap = edaData.get('netlist') as Y.Map<any>;
    netlistMap.observeDeep((events) => {
      this.emit('netlist-changed', this.getNetlist());
    });

    // Listen for validation changes
    const validationMap = edaData.get('validation') as Y.Map<any>;
    validationMap.observeDeep((events) => {
      this.emit('validation-changed', this.getValidation());
    });

    // Listen for comments changes
    const commentsArray = edaData.get('comments') as Y.Array<any>;
    commentsArray.observeDeep((events) => {
      this.emit('comments-changed', this.getComments());
    });
  }

  /**
   * Update EDA specification collaboratively
   */
  updateEdaSpec(spec: any, path?: string[]) {
    const specMap = this.doc.getMap('eda').get('spec') as Y.Map<any>;
    
    if (path && path.length > 0) {
      // Update specific path
      let current = specMap;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!current.has(key)) {
          current.set(key, new Y.Map());
        }
        current = current.get(key) as Y.Map<any>;
      }
      current.set(path[path.length - 1], spec);
    } else {
      // Replace entire spec
      specMap.clear();
      Object.entries(spec).forEach(([key, value]) => {
        specMap.set(key, value);
      });
    }
  }

  /**
   * Update component placement collaboratively
   */
  updatePlacement(placement: any[]) {
    const placementArray = this.doc.getMap('eda').get('placement') as Y.Array<any>;
    placementArray.delete(0, placementArray.length);
    placementArray.insert(0, placement);
  }

  /**
   * Update single component position
   */
  updateComponentPosition(componentRef: string, x: number, y: number) {
    const placementArray = this.doc.getMap('eda').get('placement') as Y.Array<any>;
    const placement = placementArray.toArray();
    
    const index = placement.findIndex(p => p.ref === componentRef);
    if (index >= 0) {
      const updated = { ...placement[index], x, y };
      placementArray.delete(index, 1);
      placementArray.insert(index, [updated]);
    } else {
      // Add new placement
      placementArray.push([{ ref: componentRef, x, y, rotation: 0, side: 'front' }]);
    }
  }

  /**
   * Add design comment/annotation
   */
  addComment(comment: {
    id: string;
    text: string;
    x: number;
    y: number;
    componentRef?: string;
    netName?: string;
    author: string;
    timestamp: number;
  }) {
    const commentsArray = this.doc.getMap('eda').get('comments') as Y.Array<any>;
    commentsArray.push([comment]);
  }

  /**
   * Update user cursor position
   */
  updateCursor(x: number, y: number) {
    const currentState = this.awareness.getLocalState() || {};
    this.awareness.setLocalState({
      ...currentState,
      user: {
        ...this.userData,
        cursor: { x, y }
      },
      timestamp: Date.now()
    });
  }

  /**
   * Update user selection
   */
  updateSelection(selection: {
    componentId?: string;
    netName?: string;
    pinId?: string;
  }) {
    const currentState = this.awareness.getLocalState() || {};
    this.awareness.setLocalState({
      ...currentState,
      user: {
        ...this.userData,
        selection
      },
      timestamp: Date.now()
    });
  }

  /**
   * Get current EDA specification
   */
  getEdaSpec(): any {
    const specMap = this.doc.getMap('eda').get('spec') as Y.Map<any>;
    return specMap.toJSON();
  }

  /**
   * Get current placement
   */
  getPlacement(): any[] {
    const placementArray = this.doc.getMap('eda').get('placement') as Y.Array<any>;
    return placementArray.toArray();
  }

  /**
   * Get current netlist
   */
  getNetlist(): any {
    const netlistMap = this.doc.getMap('eda').get('netlist') as Y.Map<any>;
    return netlistMap.toJSON();
  }

  /**
   * Get validation results
   */
  getValidation(): any {
    const validationMap = this.doc.getMap('eda').get('validation') as Y.Map<any>;
    return validationMap.toJSON();
  }

  /**
   * Get all comments
   */
  getComments(): any[] {
    const commentsArray = this.doc.getMap('eda').get('comments') as Y.Array<any>;
    return commentsArray.toArray();
  }

  /**
   * Get collaboration state
   */
  getCollaborationState(): CollaborationState {
    return { ...this.state };
  }

  /**
   * Add entry to history
   */
  private addToHistory(action: string, data: any) {
    const historyArray = this.doc.getMap('eda').get('history') as Y.Array<any>;
    historyArray.push([{
      id: Math.random().toString(36).substr(2, 9),
      action,
      data,
      user: this.userData.id,
      timestamp: Date.now()
    }]);

    // Keep only last 100 history entries
    if (historyArray.length > 100) {
      historyArray.delete(0, historyArray.length - 100);
    }
  }

  /**
   * Get change history
   */
  getHistory(): any[] {
    const historyArray = this.doc.getMap('eda').get('history') as Y.Array<any>;
    return historyArray.toArray();
  }

  /**
   * Event management
   */
  on(event: string, callback: Function) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event)!.push(callback);
  }

  off(event: string, callback: Function) {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const callbacks = this.callbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  /**
   * Create snapshot of current state
   */
  createSnapshot(): any {
    return {
      spec: this.getEdaSpec(),
      placement: this.getPlacement(),
      netlist: this.getNetlist(),
      validation: this.getValidation(),
      comments: this.getComments(),
      timestamp: Date.now(),
      user: this.userData.id
    };
  }

  /**
   * Restore from snapshot
   */
  restoreSnapshot(snapshot: any) {
    if (snapshot.spec) {
      this.updateEdaSpec(snapshot.spec);
    }
    if (snapshot.placement) {
      this.updatePlacement(snapshot.placement);
    }
    
    this.addToHistory('snapshot-restored', { 
      snapshotTimestamp: snapshot.timestamp,
      restoredBy: this.userData.id
    });
  }

  /**
   * Export document as Uint8Array for persistence
   */
  exportDocument(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  /**
   * Import document from Uint8Array
   */
  importDocument(update: Uint8Array) {
    Y.applyUpdate(this.doc, update);
  }

  /**
   * Cleanup and disconnect
   */
  destroy() {
    if (this.provider) {
      this.provider.destroy();
    }
    this.doc.destroy();
    this.callbacks.clear();
  }
}

/**
 * Utility functions for collaboration
 */
export const CollaborationUtils = {
  /**
   * Generate random user color
   */
  generateUserColor(): string {
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
      '#8b5cf6', '#06b6d4', '#84cc16', '#f97316',
      '#ec4899', '#6366f1', '#14b8a6', '#eab308'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  },

  /**
   * Create user avatar from initials
   */
  generateAvatarUrl(name: string, color: string): string {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
    return `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="16" fill="${color}"/>
        <text x="16" y="21" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">${initials}</text>
      </svg>
    `)}`;
  },

  /**
   * Merge conflict resolution for EDA specs
   */
  mergeEdaSpecs(local: any, remote: any, base?: any): any {
    // Simple last-writer-wins for now
    // In a production system, this would implement more sophisticated merging
    return {
      ...base,
      ...local,
      ...remote,
      components: this.mergeComponentArrays(local.components || [], remote.components || []),
      nets: this.mergeNets(local.nets || [], remote.nets || [])
    };
  },

  /**
   * Merge component arrays by reference
   */
  mergeComponentArrays(local: any[], remote: any[]): any[] {
    const merged = new Map();
    
    // Add local components
    for (const comp of local) {
      merged.set(comp.ref, comp);
    }
    
    // Merge remote components (overwrites local)
    for (const comp of remote) {
      merged.set(comp.ref, comp);
    }
    
    return Array.from(merged.values());
  },

  /**
   * Merge nets by name
   */
  mergeNets(local: any[], remote: any[]): any[] {
    const merged = new Map();
    
    // Add local nets
    for (const net of local) {
      merged.set(net.name, net);
    }
    
    // Merge remote nets
    for (const net of remote) {
      merged.set(net.name, net);
    }
    
    return Array.from(merged.values());
  }
};