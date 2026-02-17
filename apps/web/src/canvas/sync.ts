/**
 * sync.ts — Translates server canvas state into tldraw store operations.
 *
 * Compares previous vs current nodes/connections and applies creates,
 * updates, and deletes to the tldraw Editor instance.
 */

import type { Editor } from 'tldraw';
import { createShapeId } from 'tldraw';
import type { CanvasNode, CanvasConnection } from '@ch4p/canvas';
import { KNOWN_COMPONENT_TYPES } from '@ch4p/canvas';

/** Map a server component ID to a tldraw shape ID. */
function shapeId(componentId: string) {
  return createShapeId(`ch4p-${componentId}`);
}

/** Map a server connection ID to a tldraw shape ID for the arrow. */
function arrowId(connectionId: string) {
  return createShapeId(`ch4p-conn-${connectionId}`);
}

/** Determine tldraw shape type from A2UI component type. */
function tldrawType(componentType: string): string {
  return `ch4p-${componentType}`;
}

export function syncToEditor(
  editor: Editor,
  nodes: CanvasNode[],
  connections: CanvasConnection[],
  prevNodes: CanvasNode[],
  prevConnections: CanvasConnection[],
): void {
  const currentIds = new Set(nodes.map((n) => n.component.id));
  const prevIds = new Set(prevNodes.map((n) => n.component.id));

  // Shapes to create (new nodes) — skip unknown component types that would
  // crash tldraw because no ShapeUtil is registered for them.
  const toCreate = nodes.filter(
    (n) => !prevIds.has(n.component.id) && KNOWN_COMPONENT_TYPES.has(n.component.type),
  );

  // Shapes to update (existing nodes that changed) — also skip unknown types.
  const toUpdate = nodes.filter((n) => {
    if (!prevIds.has(n.component.id)) return false;
    if (!KNOWN_COMPONENT_TYPES.has(n.component.type)) return false;
    const prev = prevNodes.find((p) => p.component.id === n.component.id);
    if (!prev) return false;
    // Simple equality check — compare stringified versions
    return JSON.stringify(prev) !== JSON.stringify(n);
  });

  // Shapes to delete (removed nodes)
  const toDelete = prevNodes.filter((n) => !currentIds.has(n.component.id));

  // Apply deletes
  const deleteIds = toDelete.map((n) => shapeId(n.component.id));
  if (deleteIds.length > 0) {
    editor.deleteShapes(deleteIds);
  }

  // Apply creates
  if (toCreate.length > 0) {
    editor.createShapes(
      toCreate.map((node) => ({
        id: shapeId(node.component.id),
        type: tldrawType(node.component.type),
        x: node.position.x,
        y: node.position.y,
        props: {
          w: node.position.width ?? 300,
          h: node.position.height ?? 200,
          component: node.component,
        },
        meta: {
          componentId: node.component.id,
          componentType: node.component.type,
        },
      })),
    );
  }

  // Apply updates
  for (const node of toUpdate) {
    editor.updateShape({
      id: shapeId(node.component.id),
      type: tldrawType(node.component.type),
      x: node.position.x,
      y: node.position.y,
      props: {
        w: node.position.width ?? 300,
        h: node.position.height ?? 200,
        component: node.component,
      },
    });
  }

  // Handle connections as arrows
  const currentConnIds = new Set(connections.map((c) => c.id));
  const prevConnIds = new Set(prevConnections.map((c) => c.id));

  // Delete removed connections
  const deletedConns = prevConnections.filter((c) => !currentConnIds.has(c.id));
  if (deletedConns.length > 0) {
    editor.deleteShapes(deletedConns.map((c) => arrowId(c.id)));
  }

  // Create new connections as arrow shapes
  const newConns = connections.filter((c) => !prevConnIds.has(c.id));
  if (newConns.length > 0) {
    editor.createShapes(
      newConns.map((conn) => ({
        id: arrowId(conn.id),
        type: 'arrow',
        props: {
          start: {
            type: 'binding' as const,
            boundShapeId: shapeId(conn.fromId),
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
          end: {
            type: 'binding' as const,
            boundShapeId: shapeId(conn.toId),
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
          text: conn.label ?? '',
          dash: conn.style === 'dashed' ? 'dashed' : conn.style === 'dotted' ? 'dotted' : 'draw',
        },
      })),
    );
  }
}
