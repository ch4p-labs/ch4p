/**
 * useCanvasState — React hook that mirrors server-side canvas state.
 *
 * Processes `s2c:canvas:snapshot` and `s2c:canvas:change` messages
 * from the WebSocket to maintain a local copy of canvas nodes and
 * connections. Exposes these as React state for rendering.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  CanvasNode,
  CanvasConnection,
  CanvasChange,
  S2CMessage,
} from '@ch4p/canvas';

interface CanvasStateResult {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  handleMessage: (msg: S2CMessage) => void;
}

export function useCanvasState(_sessionId: string): CanvasStateResult {
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);

  // Use a ref to avoid stale closures in the handler
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  const applyChange = useCallback((change: CanvasChange) => {
    switch (change.type) {
      case 'add_node': {
        const node = change.data as CanvasNode;
        setNodes((prev) => [...prev, node]);
        break;
      }

      case 'update_node': {
        const updates = change.data as Record<string, unknown>;
        setNodes((prev) =>
          prev.map((n) =>
            n.component.id === change.nodeId
              ? { ...n, component: { ...n.component, ...updates } as CanvasNode['component'] }
              : n,
          ),
        );
        break;
      }

      case 'remove_node': {
        setNodes((prev) => prev.filter((n) => n.component.id !== change.nodeId));
        // Also remove connections referencing this node
        setConnections((prev) =>
          prev.filter((c) => c.fromId !== change.nodeId && c.toId !== change.nodeId),
        );
        break;
      }

      case 'move_node': {
        const position = change.data as { x?: number; y?: number; width?: number; height?: number };
        setNodes((prev) =>
          prev.map((n) =>
            n.component.id === change.nodeId
              ? { ...n, position: { ...n.position, ...position } }
              : n,
          ),
        );
        break;
      }

      case 'add_connection': {
        const connection = change.data as CanvasConnection;
        setConnections((prev) => [...prev, connection]);
        break;
      }

      case 'remove_connection': {
        setConnections((prev) => prev.filter((c) => c.id !== change.connectionId));
        break;
      }

      case 'clear': {
        setNodes([]);
        setConnections([]);
        break;
      }
    }
  }, []);

  const handleMessage = useCallback(
    (msg: S2CMessage) => {
      switch (msg.type) {
        case 's2c:canvas:snapshot':
          setNodes(msg.snapshot.nodes);
          setConnections(msg.snapshot.connections);
          break;

        case 's2c:canvas:change':
          applyChange(msg.change);
          break;
      }
    },
    [applyChange],
  );

  return { nodes, connections, handleMessage };
}
