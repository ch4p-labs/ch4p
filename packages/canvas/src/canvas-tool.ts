/**
 * CanvasTool — ITool implementation for agent-driven canvas rendering.
 *
 * Agents call the `canvas_render` tool to add, update, remove, move,
 * connect, or clear components on the A2UI canvas.  The tool interacts
 * with the per-session {@link CanvasState} which is injected into the
 * {@link ToolContext} by the gateway.
 */

import type { ITool, ToolContext, ToolResult, ValidationResult, StateSnapshot } from '@ch4p/core';
import type { JSONSchema7 } from '@ch4p/core';
import type { A2UIComponent, ComponentPosition } from './components.js';
import { isA2UIComponent, validateComponentFields } from './components.js';
import type { CanvasState } from './state.js';

// ---------------------------------------------------------------------------
// Extended context — the gateway injects the current session's CanvasState
// ---------------------------------------------------------------------------

export interface CanvasToolContext extends ToolContext {
  canvasState: CanvasState;
}

// ---------------------------------------------------------------------------
// Tool argument shape
// ---------------------------------------------------------------------------

export interface CanvasToolArgs {
  action: 'add' | 'update' | 'remove' | 'move' | 'connect' | 'clear';
  /** Required for `add`. */
  component?: A2UIComponent;
  /** Required for `add` / `move`. */
  position?: ComponentPosition;
  /** Required for `update`, `remove`, `move`. */
  componentId?: string;
  /** Partial updates for `update`. */
  updates?: Partial<A2UIComponent>;
  /** Required for `connect`. */
  fromId?: string;
  /** Required for `connect`. */
  toId?: string;
  /** Optional label for `connect`. */
  connectionLabel?: string;
  /** Optional style for `connect`. */
  connectionStyle?: 'solid' | 'dashed' | 'dotted';
}

// ---------------------------------------------------------------------------
// Parameter schema (JSON Schema 7) for tool registration
// ---------------------------------------------------------------------------

const PARAMETERS_SCHEMA: JSONSchema7 = {
  type: 'object',
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'update', 'remove', 'move', 'connect', 'clear'],
      description: 'The canvas operation to perform.',
    },
    component: {
      type: 'object',
      description: 'The A2UI component to add (required for "add" action). Must have an `id` and `type` field.',
    },
    position: {
      type: 'object',
      description: 'Position on the canvas { x, y, width?, height?, rotation? }. Required for "add" and "move".',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        rotation: { type: 'number' },
      },
      required: ['x', 'y'],
    },
    componentId: {
      type: 'string',
      description: 'Target component id (required for "update", "remove", "move").',
    },
    updates: {
      type: 'object',
      description: 'Partial component updates (for "update" action).',
    },
    fromId: {
      type: 'string',
      description: 'Source component id (for "connect" action).',
    },
    toId: {
      type: 'string',
      description: 'Target component id (for "connect" action).',
    },
    connectionLabel: {
      type: 'string',
      description: 'Label for the connection (for "connect" action).',
    },
    connectionStyle: {
      type: 'string',
      enum: ['solid', 'dashed', 'dotted'],
      description: 'Line style for the connection (for "connect" action).',
    },
  },
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// CanvasTool class
// ---------------------------------------------------------------------------

export class CanvasTool implements ITool {
  readonly name = 'canvas_render';
  readonly description =
    'Render visual components on the interactive canvas. ' +
    'Supports adding cards, charts, forms, tables, code blocks, images, ' +
    'markdown, progress bars, and status indicators. ' +
    'Components can be connected with directional edges to show relationships.';
  readonly parameters: JSONSchema7 = PARAMETERS_SCHEMA;
  readonly weight = 'lightweight' as const;

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  validate(args: unknown): ValidationResult {
    const a = args as CanvasToolArgs;
    const errors: string[] = [];

    if (!a || typeof a !== 'object') {
      return { valid: false, errors: ['Arguments must be an object.'] };
    }

    if (!a.action) {
      errors.push('Missing required field "action".');
      return { valid: false, errors };
    }

    switch (a.action) {
      case 'add':
        if (!a.component) {
          errors.push('"add" requires a "component" object.');
        } else if (!isA2UIComponent(a.component)) {
          errors.push('"component" must have "id" and "type" fields.');
        } else {
          // Validate type-specific required fields so malformed components
          // never reach the frontend and crash the tldraw renderer.
          const fieldErrors = validateComponentFields(a.component);
          errors.push(...fieldErrors);
        }
        if (!a.position) errors.push('"add" requires a "position" object.');
        else if (typeof a.position.x !== 'number' || typeof a.position.y !== 'number')
          errors.push('"position" must have numeric "x" and "y" fields.');
        break;

      case 'update':
        if (!a.componentId) errors.push('"update" requires "componentId".');
        if (!a.updates || typeof a.updates !== 'object') errors.push('"update" requires "updates" object.');
        break;

      case 'remove':
        if (!a.componentId) errors.push('"remove" requires "componentId".');
        break;

      case 'move':
        if (!a.componentId) errors.push('"move" requires "componentId".');
        if (!a.position) errors.push('"move" requires a "position" object.');
        break;

      case 'connect':
        if (!a.fromId) errors.push('"connect" requires "fromId".');
        if (!a.toId) errors.push('"connect" requires "toId".');
        break;

      case 'clear':
        // No additional fields required.
        break;

      default:
        errors.push(`Unknown action "${String(a.action)}". Use: add, update, remove, move, connect, clear.`);
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const a = args as CanvasToolArgs;
    const canvasState = (context as CanvasToolContext).canvasState;

    if (!canvasState) {
      return {
        success: false,
        output: '',
        error: 'No canvas state available in context. Is this a canvas session?',
      };
    }

    try {
      switch (a.action) {
        case 'add': {
          const id = canvasState.addComponent(a.component!, a.position!);
          return {
            success: true,
            output: `Component "${a.component!.type}" added with id "${id}" at (${a.position!.x}, ${a.position!.y}).`,
          };
        }

        case 'update': {
          const updated = canvasState.updateComponent(a.componentId!, a.updates!);
          if (!updated) {
            return { success: false, output: '', error: `Component "${a.componentId}" not found.` };
          }
          return { success: true, output: `Component "${a.componentId}" updated.` };
        }

        case 'remove': {
          const removed = canvasState.removeComponent(a.componentId!);
          if (!removed) {
            return { success: false, output: '', error: `Component "${a.componentId}" not found.` };
          }
          return { success: true, output: `Component "${a.componentId}" removed.` };
        }

        case 'move': {
          const moved = canvasState.moveComponent(a.componentId!, a.position!);
          if (!moved) {
            return { success: false, output: '', error: `Component "${a.componentId}" not found.` };
          }
          return { success: true, output: `Component "${a.componentId}" moved to (${a.position!.x}, ${a.position!.y}).` };
        }

        case 'connect': {
          const connId = canvasState.addConnection(
            a.fromId!,
            a.toId!,
            a.connectionLabel,
            a.connectionStyle,
          );
          return {
            success: true,
            output: `Connection created: "${a.fromId}" → "${a.toId}" (id: "${connId}").`,
          };
        }

        case 'clear': {
          canvasState.clear();
          return { success: true, output: 'Canvas cleared.' };
        }

        default:
          return { success: false, output: '', error: `Unknown action "${String(a.action)}".` };
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : 'Unknown error during canvas operation.',
      };
    }
  }

  // -------------------------------------------------------------------------
  // AWM state snapshot (optional)
  // -------------------------------------------------------------------------

  async getStateSnapshot(_args: unknown, context: ToolContext): Promise<StateSnapshot> {
    const canvasState = (context as CanvasToolContext).canvasState;

    const snapshot = canvasState?.getSnapshot();
    return {
      timestamp: new Date().toISOString(),
      state: {
        nodeCount: snapshot?.nodes.length ?? 0,
        connectionCount: snapshot?.connections.length ?? 0,
        nodes: snapshot?.nodes.map((n) => ({
          id: n.component.id,
          type: n.component.type,
          position: n.position,
        })) ?? [],
      },
      description: `Canvas state: ${snapshot?.nodes.length ?? 0} nodes, ${snapshot?.connections.length ?? 0} connections`,
    };
  }
}
