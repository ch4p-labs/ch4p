/**
 * CanvasState — server-side state model for the A2UI canvas.
 *
 * Maintains the set of nodes (components with positions) and connections
 * between them, provides CRUD helpers, snapshot access, and a lightweight
 * change-listener system so consumers can react to mutations.
 */

import type { A2UIComponent, ComponentPosition } from './components.js';
import { generateId } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

/** A positioned component on the canvas. */
export interface CanvasNode {
  component: A2UIComponent;
  position: ComponentPosition;
  zIndex: number;
}

/** A directed edge between two canvas nodes. */
export interface CanvasConnection {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

/** Serialisable point-in-time representation of the entire canvas. */
export interface CanvasSnapshot {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
}

// ---------------------------------------------------------------------------
// Change tracking
// ---------------------------------------------------------------------------

/** Discriminant for the kind of mutation that occurred. */
export type CanvasChangeType =
  | 'add_node'
  | 'update_node'
  | 'remove_node'
  | 'move_node'
  | 'add_connection'
  | 'remove_connection'
  | 'clear'
  | 'batch';

/** Describes a single mutation against the canvas state. */
export interface CanvasChange {
  type: CanvasChangeType;
  nodeId?: string;
  connectionId?: string;
  data?: unknown;
  /** ISO-8601 timestamp of when the change occurred. */
  timestamp: string;
}

/** Callback signature for canvas change listeners. */
export type CanvasChangeListener = (change: CanvasChange) => void;

// ---------------------------------------------------------------------------
// CanvasState class
// ---------------------------------------------------------------------------

/**
 * Mutable, in-memory model of a canvas.
 *
 * All write methods emit a {@link CanvasChange} so that transport layers
 * (WebSocket, SSE, etc.) can forward incremental updates to clients.
 */
export class CanvasState {
  private nodes = new Map<string, CanvasNode>();
  private connections = new Map<string, CanvasConnection>();
  private nextZIndex = 1;
  private listeners: CanvasChangeListener[] = [];
  private readonly maxComponents: number;

  constructor(maxComponents = 500) {
    this.maxComponents = maxComponents;
  }

  // -----------------------------------------------------------------------
  // Node CRUD
  // -----------------------------------------------------------------------

  /**
   * Add a component to the canvas at the given position.
   *
   * @returns The component's `id`.
   * @throws {Error} If the maximum component limit has been reached.
   */
  addComponent(component: A2UIComponent, position: ComponentPosition): string {
    if (this.nodes.size >= this.maxComponents) {
      throw new Error(
        `Canvas component limit reached (max ${this.maxComponents})`,
      );
    }

    const node: CanvasNode = {
      component,
      position,
      zIndex: this.nextZIndex++,
    };

    this.nodes.set(component.id, node);

    this.emit({
      type: 'add_node',
      nodeId: component.id,
      data: node,
      timestamp: new Date().toISOString(),
    });

    return component.id;
  }

  /**
   * Merge partial updates into an existing component.
   *
   * @returns `true` if the node existed and was updated.
   */
  updateComponent(id: string, updates: Partial<A2UIComponent>): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    node.component = { ...node.component, ...updates } as A2UIComponent;

    this.emit({
      type: 'update_node',
      nodeId: id,
      data: updates,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Remove a component and cascade-delete any connections referencing it.
   *
   * @returns `true` if the node existed and was removed.
   */
  removeComponent(id: string): boolean {
    if (!this.nodes.delete(id)) return false;

    // Cascade-delete connections that reference this node.
    for (const [connId, conn] of this.connections) {
      if (conn.fromId === id || conn.toId === id) {
        this.connections.delete(connId);
      }
    }

    this.emit({
      type: 'remove_node',
      nodeId: id,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Update the position (and optionally size / rotation) of a component.
   *
   * @returns `true` if the node existed and was moved.
   */
  moveComponent(id: string, position: Partial<ComponentPosition>): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    node.position = { ...node.position, ...position };

    this.emit({
      type: 'move_node',
      nodeId: id,
      data: position,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  // -----------------------------------------------------------------------
  // Connection CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a directed connection between two existing nodes.
   *
   * @returns The new connection's `id`.
   * @throws {Error} If either endpoint node does not exist.
   */
  addConnection(
    fromId: string,
    toId: string,
    label?: string,
    style?: 'solid' | 'dashed' | 'dotted',
  ): string {
    if (!this.nodes.has(fromId)) {
      throw new Error(`Source node "${fromId}" does not exist`);
    }
    if (!this.nodes.has(toId)) {
      throw new Error(`Target node "${toId}" does not exist`);
    }

    const id = generateId(12);
    const connection: CanvasConnection = { id, fromId, toId, label, style };

    this.connections.set(id, connection);

    this.emit({
      type: 'add_connection',
      connectionId: id,
      data: connection,
      timestamp: new Date().toISOString(),
    });

    return id;
  }

  /**
   * Remove a connection by id.
   *
   * @returns `true` if the connection existed and was removed.
   */
  removeConnection(id: string): boolean {
    if (!this.connections.delete(id)) return false;

    this.emit({
      type: 'remove_connection',
      connectionId: id,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  // -----------------------------------------------------------------------
  // Bulk operations
  // -----------------------------------------------------------------------

  /** Remove all nodes and connections, resetting the canvas to an empty state. */
  clear(): void {
    this.nodes.clear();
    this.connections.clear();
    this.nextZIndex = 1;

    this.emit({
      type: 'clear',
      timestamp: new Date().toISOString(),
    });
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** Look up a single node by component id. */
  getNode(id: string): CanvasNode | undefined {
    return this.nodes.get(id);
  }

  /** Look up a single connection by id. */
  getConnection(id: string): CanvasConnection | undefined {
    return this.connections.get(id);
  }

  /** Return all nodes as an array. */
  getAllNodes(): CanvasNode[] {
    return Array.from(this.nodes.values());
  }

  /** Return all connections as an array. */
  getAllConnections(): CanvasConnection[] {
    return Array.from(this.connections.values());
  }

  /** Produce a serialisable snapshot of the entire canvas. */
  getSnapshot(): CanvasSnapshot {
    return {
      nodes: this.getAllNodes(),
      connections: this.getAllConnections(),
    };
  }

  /** Return the current number of nodes on the canvas. */
  getNodeCount(): number {
    return this.nodes.size;
  }

  // -----------------------------------------------------------------------
  // Change listener
  // -----------------------------------------------------------------------

  /**
   * Subscribe to canvas mutations.
   *
   * @returns An unsubscribe function.
   */
  onChange(listener: CanvasChangeListener): () => void {
    this.listeners.push(listener);

    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Notify all registered listeners of a change. */
  private emit(change: CanvasChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
