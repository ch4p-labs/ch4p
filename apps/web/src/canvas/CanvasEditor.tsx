/**
 * CanvasEditor — tldraw-based infinite canvas for A2UI components.
 *
 * Registers custom shape types for each A2UI component and syncs
 * server-side canvas state (nodes + connections) into the tldraw store.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import type { CanvasNode, CanvasConnection, ComponentPosition } from '@ch4p/canvas';
import { syncToEditor } from './sync';
import { customShapeUtils } from './shapes';

interface CanvasEditorProps {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  onDrag: (componentId: string, position: ComponentPosition) => void;
  onClick: (componentId: string, actionId?: string) => void;
  onFormSubmit: (componentId: string, values: Record<string, unknown>) => void;
}

export function CanvasEditor({ nodes, connections, onDrag, onClick, onFormSubmit }: CanvasEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const prevNodesRef = useRef<CanvasNode[]>([]);
  const prevConnectionsRef = useRef<CanvasConnection[]>([]);

  // Sync server state to tldraw whenever nodes/connections change
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    syncToEditor(editor, nodes, connections, prevNodesRef.current, prevConnectionsRef.current);
    prevNodesRef.current = nodes;
    prevConnectionsRef.current = connections;
  }, [nodes, connections]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Wire interaction handlers so shape components can access them
      interactionHandlers.onClick = onClick;
      interactionHandlers.onFormSubmit = onFormSubmit;

      // Listen for shape position changes (drag events)
      editor.sideEffects.registerAfterChangeHandler('shape', (_prev, next) => {
        // Only report position changes for our custom shapes
        if (next.type.startsWith('ch4p-') && next.id) {
          const componentId = next.meta?.componentId as string | undefined;
          if (componentId) {
            onDrag(componentId, { x: next.x, y: next.y });
          }
        }
      });
    },
    [onDrag, onClick, onFormSubmit],
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        options={{ maxPages: 1 }}
      />
    </div>
  );
}

// Re-export for App.tsx convenience
export type { CanvasEditorProps };

// Store click/form handlers as module-level for shape components to access
export const interactionHandlers = {
  onClick: (_componentId: string, _actionId?: string) => {},
  onFormSubmit: (_componentId: string, _values: Record<string, unknown>) => {},
};
