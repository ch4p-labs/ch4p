/**
 * CanvasEditor — tldraw-based infinite canvas for A2UI components.
 *
 * Registers custom shape types for each A2UI component and syncs
 * server-side canvas state (nodes + connections) into the tldraw store.
 */

import { Component, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Tldraw, type Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import type { CanvasNode, CanvasConnection, ComponentPosition } from '@ch4p/canvas';
import { syncToEditor } from './sync';
import { customShapeUtils } from './shapes';

// ---------------------------------------------------------------------------
// Error Boundary — catches render errors in tldraw / shape components so
// the entire canvas doesn't white-screen.
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class CanvasErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CanvasEditor] Render error caught by boundary:', error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafafa',
            fontFamily: '-apple-system, sans-serif',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>Canvas render error</div>
          <div style={{ fontSize: 13, color: '#888', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message ?? 'An unexpected error occurred while rendering the canvas.'}
          </div>
          <button
            style={{
              marginTop: 8,
              padding: '8px 20px',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 13,
            }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// CanvasEditor component
// ---------------------------------------------------------------------------

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

    try {
      syncToEditor(editor, nodes, connections, prevNodesRef.current, prevConnectionsRef.current);
    } catch (err) {
      console.error('[CanvasEditor] syncToEditor failed:', err);
    }
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
    <CanvasErrorBoundary>
      <div style={{ width: '100%', height: '100%' }}>
        <Tldraw
          shapeUtils={customShapeUtils}
          onMount={handleMount}
          options={{ maxPages: 1 }}
        />
      </div>
    </CanvasErrorBoundary>
  );
}

// Re-export for App.tsx convenience
export type { CanvasEditorProps };

// Store click/form handlers as module-level for shape components to access
export const interactionHandlers = {
  onClick: (_componentId: string, _actionId?: string) => {},
  onFormSubmit: (_componentId: string, _values: Record<string, unknown>) => {},
};
