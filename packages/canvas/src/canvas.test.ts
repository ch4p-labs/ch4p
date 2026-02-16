/**
 * Canvas package tests — components, state, protocol, CanvasTool, CanvasChannel.
 *
 * Covers: component construction, type guards, state CRUD, change listeners,
 * component limits, protocol encode/decode/guards, tool validation + execution,
 * channel C2S → InboundMessage translation, and AWM snapshots.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateId } from '@ch4p/core';
import type { ToolContext } from '@ch4p/core';

// Components
import type {
  A2UIComponent,
  CardComponent,
  ChartComponent,
  FormComponent,
  ButtonComponent,
  TextFieldComponent,
  DataTableComponent,
  CodeBlockComponent,
  MarkdownComponent,
  ImageComponent,
  ProgressComponent,
  StatusComponent,
  ComponentPosition,
} from './components.js';
import { isA2UIComponent } from './components.js';

// State
import { CanvasState } from './state.js';
import type { CanvasChange } from './state.js';

// Protocol
import {
  encodeMessage,
  decodeS2C,
  decodeC2S,
  isS2CMessage,
  isC2SMessage,
} from './protocol.js';
import type { S2CMessage, C2SMessage } from './protocol.js';

// Tool
import { CanvasTool } from './canvas-tool.js';
import type { CanvasToolContext } from './canvas-tool.js';

// Channel
import { CanvasChannel } from './canvas-channel.js';
import type { InboundMessage } from '@ch4p/core';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeCard(id = 'card-1'): CardComponent {
  return {
    id,
    type: 'card',
    title: 'Test Card',
    body: 'Hello **world**',
    actions: [{ id: 'act-1', text: 'Click me', action: 'click' }],
  };
}

function makeChart(id = 'chart-1'): ChartComponent {
  return {
    id,
    type: 'chart',
    chartType: 'bar',
    data: {
      labels: ['A', 'B', 'C'],
      datasets: [{ label: 'Dataset 1', values: [10, 20, 30] }],
    },
  };
}

function makeForm(id = 'form-1'): FormComponent {
  return {
    id,
    type: 'form',
    title: 'Test Form',
    fields: [
      { name: 'name', fieldType: 'text', label: 'Name', required: true },
      { name: 'age', fieldType: 'number', label: 'Age' },
    ],
    submitLabel: 'Submit',
  };
}

function makeButton(id = 'btn-1'): ButtonComponent {
  return { id, type: 'button', text: 'Click', variant: 'primary' };
}

function makePosition(x = 100, y = 200): ComponentPosition {
  return { x, y, width: 300, height: 200 };
}

function makeToolContext(canvasState: CanvasState): CanvasToolContext {
  return {
    sessionId: 'test-session',
    workspace: '/tmp/test',
    canvasState,
  } as CanvasToolContext;
}

// ============================================================================
// COMPONENT TYPES
// ============================================================================

describe('A2UI Components', () => {
  describe('isA2UIComponent', () => {
    it('returns true for valid components', () => {
      expect(isA2UIComponent(makeCard())).toBe(true);
      expect(isA2UIComponent(makeChart())).toBe(true);
      expect(isA2UIComponent(makeForm())).toBe(true);
      expect(isA2UIComponent(makeButton())).toBe(true);
      expect(isA2UIComponent({ id: 'x', type: 'markdown', content: '# Hi' })).toBe(true);
    });

    it('returns false for null/undefined/primitives', () => {
      expect(isA2UIComponent(null)).toBe(false);
      expect(isA2UIComponent(undefined)).toBe(false);
      expect(isA2UIComponent(42)).toBe(false);
      expect(isA2UIComponent('string')).toBe(false);
      expect(isA2UIComponent(true)).toBe(false);
    });

    it('returns false for objects missing id or type', () => {
      expect(isA2UIComponent({})).toBe(false);
      expect(isA2UIComponent({ id: 'x' })).toBe(false);
      expect(isA2UIComponent({ type: 'card' })).toBe(false);
      expect(isA2UIComponent({ id: 42, type: 'card' })).toBe(false);
    });
  });

  describe('component construction', () => {
    it('card has required fields', () => {
      const card = makeCard();
      expect(card.type).toBe('card');
      expect(card.title).toBe('Test Card');
      expect(card.body).toContain('world');
      expect(card.actions).toHaveLength(1);
    });

    it('chart has data and chartType', () => {
      const chart = makeChart();
      expect(chart.chartType).toBe('bar');
      expect(chart.data.labels).toHaveLength(3);
      expect(chart.data.datasets[0]!.values).toEqual([10, 20, 30]);
    });

    it('form has fields and submitLabel', () => {
      const form = makeForm();
      expect(form.fields).toHaveLength(2);
      expect(form.fields[0]!.fieldType).toBe('text');
      expect(form.submitLabel).toBe('Submit');
    });

    it('all 11 component types can be constructed', () => {
      const components: A2UIComponent[] = [
        makeCard(),
        makeChart(),
        makeForm(),
        makeButton(),
        { id: 'tf-1', type: 'text_field', placeholder: 'Enter text' } as TextFieldComponent,
        { id: 'dt-1', type: 'data_table', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] } as DataTableComponent,
        { id: 'cb-1', type: 'code_block', code: 'console.log(1)', language: 'javascript' } as CodeBlockComponent,
        { id: 'md-1', type: 'markdown', content: '# Hello' } as MarkdownComponent,
        { id: 'img-1', type: 'image', src: 'https://example.com/img.png' } as ImageComponent,
        { id: 'prog-1', type: 'progress', value: 50 } as ProgressComponent,
        { id: 'stat-1', type: 'status', state: 'idle' } as StatusComponent,
      ];
      expect(components).toHaveLength(11);
      for (const c of components) {
        expect(isA2UIComponent(c)).toBe(true);
      }
    });
  });
});

// ============================================================================
// CANVAS STATE
// ============================================================================

describe('CanvasState', () => {
  let state: CanvasState;

  beforeEach(() => {
    state = new CanvasState();
  });

  // -------------------------------------------------------------------------
  // Node CRUD
  // -------------------------------------------------------------------------

  describe('addComponent', () => {
    it('adds a node and returns the component id', () => {
      const id = state.addComponent(makeCard(), makePosition());
      expect(id).toBe('card-1');
      expect(state.getNodeCount()).toBe(1);
    });

    it('retrieves added node by id', () => {
      state.addComponent(makeCard('c1'), makePosition(10, 20));
      const node = state.getNode('c1');
      expect(node).toBeDefined();
      expect(node!.component.id).toBe('c1');
      expect(node!.position.x).toBe(10);
      expect(node!.position.y).toBe(20);
      expect(node!.zIndex).toBe(1);
    });

    it('increments zIndex for each new component', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition());
      expect(state.getNode('c1')!.zIndex).toBe(1);
      expect(state.getNode('c2')!.zIndex).toBe(2);
    });
  });

  describe('updateComponent', () => {
    it('updates an existing component', () => {
      state.addComponent(makeCard('c1'), makePosition());
      const updated = state.updateComponent('c1', { title: 'Updated Title' } as Partial<CardComponent>);
      expect(updated).toBe(true);
      const node = state.getNode('c1');
      expect((node!.component as CardComponent).title).toBe('Updated Title');
    });

    it('returns false for nonexistent component', () => {
      expect(state.updateComponent('nope', { title: 'X' } as Partial<CardComponent>)).toBe(false);
    });
  });

  describe('removeComponent', () => {
    it('removes an existing component', () => {
      state.addComponent(makeCard('c1'), makePosition());
      const removed = state.removeComponent('c1');
      expect(removed).toBe(true);
      expect(state.getNodeCount()).toBe(0);
      expect(state.getNode('c1')).toBeUndefined();
    });

    it('returns false for nonexistent component', () => {
      expect(state.removeComponent('nope')).toBe(false);
    });

    it('cascade-deletes connections referencing removed node', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(300, 200));
      const connId = state.addConnection('c1', 'c2', 'link');

      state.removeComponent('c1');
      expect(state.getConnection(connId)).toBeUndefined();
      expect(state.getAllConnections()).toHaveLength(0);
    });
  });

  describe('moveComponent', () => {
    it('moves a component to a new position', () => {
      state.addComponent(makeCard('c1'), makePosition(0, 0));
      const moved = state.moveComponent('c1', { x: 500, y: 600 });
      expect(moved).toBe(true);
      expect(state.getNode('c1')!.position.x).toBe(500);
      expect(state.getNode('c1')!.position.y).toBe(600);
    });

    it('partial position update preserves other fields', () => {
      state.addComponent(makeCard('c1'), makePosition(100, 200));
      state.moveComponent('c1', { x: 999 });
      const pos = state.getNode('c1')!.position;
      expect(pos.x).toBe(999);
      expect(pos.y).toBe(200); // Unchanged
      expect(pos.width).toBe(300); // Unchanged
    });

    it('returns false for nonexistent component', () => {
      expect(state.moveComponent('nope', { x: 0, y: 0 })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Connection CRUD
  // -------------------------------------------------------------------------

  describe('addConnection', () => {
    it('creates a connection between two nodes', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      const connId = state.addConnection('c1', 'c2', 'depends on', 'dashed');

      expect(connId).toBeTruthy();
      const conn = state.getConnection(connId);
      expect(conn).toBeDefined();
      expect(conn!.fromId).toBe('c1');
      expect(conn!.toId).toBe('c2');
      expect(conn!.label).toBe('depends on');
      expect(conn!.style).toBe('dashed');
    });

    it('throws when source node does not exist', () => {
      state.addComponent(makeCard('c2'), makePosition());
      expect(() => state.addConnection('nope', 'c2')).toThrow('Source node "nope" does not exist');
    });

    it('throws when target node does not exist', () => {
      state.addComponent(makeCard('c1'), makePosition());
      expect(() => state.addConnection('c1', 'nope')).toThrow('Target node "nope" does not exist');
    });
  });

  describe('removeConnection', () => {
    it('removes an existing connection', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      const connId = state.addConnection('c1', 'c2');

      expect(state.removeConnection(connId)).toBe(true);
      expect(state.getConnection(connId)).toBeUndefined();
    });

    it('returns false for nonexistent connection', () => {
      expect(state.removeConnection('nope')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Bulk operations
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('removes all nodes and connections', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      state.addConnection('c1', 'c2');

      state.clear();
      expect(state.getNodeCount()).toBe(0);
      expect(state.getAllNodes()).toHaveLength(0);
      expect(state.getAllConnections()).toHaveLength(0);
    });

    it('resets zIndex counter', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      state.clear();

      state.addComponent(makeCard('c3'), makePosition());
      expect(state.getNode('c3')!.zIndex).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  describe('queries', () => {
    it('getSnapshot returns full state', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeChart('c2'), makePosition(400, 200));
      state.addConnection('c1', 'c2');

      const snapshot = state.getSnapshot();
      expect(snapshot.nodes).toHaveLength(2);
      expect(snapshot.connections).toHaveLength(1);
    });

    it('getAllNodes returns array of all nodes', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      expect(state.getAllNodes()).toHaveLength(2);
    });

    it('getAllConnections returns array of all connections', () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      state.addConnection('c1', 'c2');
      state.addConnection('c2', 'c1');
      expect(state.getAllConnections()).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // Change listener
  // -------------------------------------------------------------------------

  describe('change listener', () => {
    it('emits add_node change', () => {
      const changes: CanvasChange[] = [];
      state.onChange((c) => changes.push(c));

      state.addComponent(makeCard('c1'), makePosition());
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('add_node');
      expect(changes[0]!.nodeId).toBe('c1');
      expect(changes[0]!.timestamp).toBeTruthy();
    });

    it('emits update_node change', () => {
      const changes: CanvasChange[] = [];
      state.addComponent(makeCard('c1'), makePosition());
      state.onChange((c) => changes.push(c));

      state.updateComponent('c1', { title: 'New' } as Partial<CardComponent>);
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('update_node');
    });

    it('emits remove_node change', () => {
      const changes: CanvasChange[] = [];
      state.addComponent(makeCard('c1'), makePosition());
      state.onChange((c) => changes.push(c));

      state.removeComponent('c1');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('remove_node');
    });

    it('emits move_node change', () => {
      const changes: CanvasChange[] = [];
      state.addComponent(makeCard('c1'), makePosition());
      state.onChange((c) => changes.push(c));

      state.moveComponent('c1', { x: 999 });
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('move_node');
    });

    it('emits add_connection change', () => {
      const changes: CanvasChange[] = [];
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      state.onChange((c) => changes.push(c));

      state.addConnection('c1', 'c2');
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('add_connection');
      expect(changes[0]!.connectionId).toBeTruthy();
    });

    it('emits remove_connection change', () => {
      const changes: CanvasChange[] = [];
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      const connId = state.addConnection('c1', 'c2');
      state.onChange((c) => changes.push(c));

      state.removeConnection(connId);
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('remove_connection');
    });

    it('emits clear change', () => {
      const changes: CanvasChange[] = [];
      state.addComponent(makeCard('c1'), makePosition());
      state.onChange((c) => changes.push(c));

      state.clear();
      expect(changes).toHaveLength(1);
      expect(changes[0]!.type).toBe('clear');
    });

    it('unsubscribe stops notifications', () => {
      const changes: CanvasChange[] = [];
      const unsub = state.onChange((c) => changes.push(c));

      state.addComponent(makeCard('c1'), makePosition());
      expect(changes).toHaveLength(1);

      unsub();
      state.addComponent(makeCard('c2'), makePosition());
      expect(changes).toHaveLength(1); // No new change
    });

    it('multiple listeners all receive changes', () => {
      const a: CanvasChange[] = [];
      const b: CanvasChange[] = [];
      state.onChange((c) => a.push(c));
      state.onChange((c) => b.push(c));

      state.addComponent(makeCard('c1'), makePosition());
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Component limit
  // -------------------------------------------------------------------------

  describe('maxComponents limit', () => {
    it('enforces component limit', () => {
      const limited = new CanvasState(3);
      limited.addComponent(makeCard('c1'), makePosition());
      limited.addComponent(makeCard('c2'), makePosition());
      limited.addComponent(makeCard('c3'), makePosition());

      expect(() => limited.addComponent(makeCard('c4'), makePosition())).toThrow(
        'Canvas component limit reached (max 3)',
      );
    });

    it('allows adding after removing (back under limit)', () => {
      const limited = new CanvasState(2);
      limited.addComponent(makeCard('c1'), makePosition());
      limited.addComponent(makeCard('c2'), makePosition());

      limited.removeComponent('c1');
      expect(() => limited.addComponent(makeCard('c3'), makePosition())).not.toThrow();
      expect(limited.getNodeCount()).toBe(2);
    });
  });
});

// ============================================================================
// PROTOCOL
// ============================================================================

describe('Protocol', () => {
  describe('encodeMessage / decode', () => {
    it('round-trips S2C messages', () => {
      const msg: S2CMessage = {
        type: 's2c:text:complete',
        text: 'Hello from agent',
      };
      const encoded = encodeMessage(msg);
      const decoded = decodeS2C(encoded);
      expect(decoded.type).toBe('s2c:text:complete');
      expect((decoded as typeof msg).text).toBe('Hello from agent');
    });

    it('round-trips C2S messages', () => {
      const msg: C2SMessage = {
        type: 'c2s:message',
        text: 'Hello from user',
      };
      const encoded = encodeMessage(msg);
      const decoded = decodeC2S(encoded);
      expect(decoded.type).toBe('c2s:message');
      expect((decoded as typeof msg).text).toBe('Hello from user');
    });

    it('encodes canvas change messages', () => {
      const msg: S2CMessage = {
        type: 's2c:canvas:change',
        change: {
          type: 'add_node',
          nodeId: 'c1',
          data: { component: makeCard(), position: makePosition() },
          timestamp: new Date().toISOString(),
        },
      };
      const encoded = encodeMessage(msg);
      const decoded = decodeS2C(encoded);
      expect(decoded.type).toBe('s2c:canvas:change');
    });
  });

  describe('isS2CMessage', () => {
    it('returns true for S2C messages', () => {
      expect(isS2CMessage({ type: 's2c:text:complete', text: 'ok' })).toBe(true);
      expect(isS2CMessage({ type: 's2c:agent:status', status: 'idle' })).toBe(true);
      expect(isS2CMessage({ type: 's2c:pong', timestamp: '' })).toBe(true);
    });

    it('returns false for C2S messages', () => {
      expect(isS2CMessage({ type: 'c2s:message', text: 'hi' })).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(isS2CMessage(null)).toBe(false);
      expect(isS2CMessage('s2c:foo')).toBe(false);
      expect(isS2CMessage(42)).toBe(false);
    });
  });

  describe('isC2SMessage', () => {
    it('returns true for C2S messages', () => {
      expect(isC2SMessage({ type: 'c2s:message', text: 'hi' })).toBe(true);
      expect(isC2SMessage({ type: 'c2s:click', componentId: 'c1' })).toBe(true);
      expect(isC2SMessage({ type: 'c2s:ping', timestamp: '' })).toBe(true);
    });

    it('returns false for S2C messages', () => {
      expect(isC2SMessage({ type: 's2c:text:complete', text: 'ok' })).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(isC2SMessage(null)).toBe(false);
      expect(isC2SMessage(undefined)).toBe(false);
    });
  });
});

// ============================================================================
// CANVAS TOOL
// ============================================================================

describe('CanvasTool', () => {
  let tool: CanvasTool;
  let state: CanvasState;
  let ctx: CanvasToolContext;

  beforeEach(() => {
    tool = new CanvasTool();
    state = new CanvasState();
    ctx = makeToolContext(state);
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------

  describe('metadata', () => {
    it('has correct name and weight', () => {
      expect(tool.name).toBe('canvas_render');
      expect(tool.weight).toBe('lightweight');
    });

    it('has a description', () => {
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('has a parameters schema', () => {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.properties).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  describe('validate', () => {
    it('rejects non-object args', () => {
      const result = tool.validate(null);
      expect(result.valid).toBe(false);
    });

    it('rejects missing action', () => {
      const result = tool.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field "action".');
    });

    it('validates add action — requires component + position', () => {
      expect(tool.validate({ action: 'add' }).valid).toBe(false);

      expect(tool.validate({
        action: 'add',
        component: makeCard(),
        position: makePosition(),
      }).valid).toBe(true);
    });

    it('add rejects component without id/type', () => {
      const result = tool.validate({
        action: 'add',
        component: { title: 'No ID' },
        position: makePosition(),
      });
      expect(result.valid).toBe(false);
    });

    it('add rejects position without numeric x/y', () => {
      const result = tool.validate({
        action: 'add',
        component: makeCard(),
        position: { x: 'foo', y: 'bar' },
      });
      expect(result.valid).toBe(false);
    });

    it('validates update action — requires componentId + updates', () => {
      expect(tool.validate({ action: 'update' }).valid).toBe(false);
      expect(tool.validate({
        action: 'update',
        componentId: 'c1',
        updates: { title: 'New' },
      }).valid).toBe(true);
    });

    it('validates remove action — requires componentId', () => {
      expect(tool.validate({ action: 'remove' }).valid).toBe(false);
      expect(tool.validate({ action: 'remove', componentId: 'c1' }).valid).toBe(true);
    });

    it('validates move action — requires componentId + position', () => {
      expect(tool.validate({ action: 'move' }).valid).toBe(false);
      expect(tool.validate({
        action: 'move',
        componentId: 'c1',
        position: { x: 10, y: 20 },
      }).valid).toBe(true);
    });

    it('validates connect action — requires fromId + toId', () => {
      expect(tool.validate({ action: 'connect' }).valid).toBe(false);
      expect(tool.validate({
        action: 'connect',
        fromId: 'c1',
        toId: 'c2',
      }).valid).toBe(true);
    });

    it('validates clear action — no extra fields needed', () => {
      expect(tool.validate({ action: 'clear' }).valid).toBe(true);
    });

    it('rejects unknown action', () => {
      const result = tool.validate({ action: 'explode' });
      expect(result.valid).toBe(false);
      expect(result.errors![0]).toContain('Unknown action');
    });
  });

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------

  describe('execute', () => {
    it('add — creates component on canvas', async () => {
      const result = await tool.execute(
        { action: 'add', component: makeCard('c1'), position: makePosition() },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('c1');
      expect(state.getNodeCount()).toBe(1);
    });

    it('update — modifies existing component', async () => {
      state.addComponent(makeCard('c1'), makePosition());
      const result = await tool.execute(
        { action: 'update', componentId: 'c1', updates: { title: 'New' } },
        ctx,
      );
      expect(result.success).toBe(true);
      expect((state.getNode('c1')!.component as CardComponent).title).toBe('New');
    });

    it('update — fails for nonexistent component', async () => {
      const result = await tool.execute(
        { action: 'update', componentId: 'nope', updates: { title: 'X' } },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('remove — deletes component from canvas', async () => {
      state.addComponent(makeCard('c1'), makePosition());
      const result = await tool.execute({ action: 'remove', componentId: 'c1' }, ctx);
      expect(result.success).toBe(true);
      expect(state.getNodeCount()).toBe(0);
    });

    it('remove — fails for nonexistent component', async () => {
      const result = await tool.execute({ action: 'remove', componentId: 'nope' }, ctx);
      expect(result.success).toBe(false);
    });

    it('move — repositions component', async () => {
      state.addComponent(makeCard('c1'), makePosition(0, 0));
      const result = await tool.execute(
        { action: 'move', componentId: 'c1', position: { x: 500, y: 600 } },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(state.getNode('c1')!.position.x).toBe(500);
    });

    it('move — fails for nonexistent component', async () => {
      const result = await tool.execute(
        { action: 'move', componentId: 'nope', position: { x: 0, y: 0 } },
        ctx,
      );
      expect(result.success).toBe(false);
    });

    it('connect — creates connection between nodes', async () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      const result = await tool.execute(
        { action: 'connect', fromId: 'c1', toId: 'c2', connectionLabel: 'flows to' },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.output).toContain('Connection created');
      expect(state.getAllConnections()).toHaveLength(1);
    });

    it('connect — fails when node missing', async () => {
      state.addComponent(makeCard('c1'), makePosition());
      const result = await tool.execute(
        { action: 'connect', fromId: 'c1', toId: 'nope' },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('clear — clears the canvas', async () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeCard('c2'), makePosition(400, 200));
      state.addConnection('c1', 'c2');

      const result = await tool.execute({ action: 'clear' }, ctx);
      expect(result.success).toBe(true);
      expect(state.getNodeCount()).toBe(0);
      expect(state.getAllConnections()).toHaveLength(0);
    });

    it('fails when no canvas state in context', async () => {
      const noStateCtx = { sessionId: 'test', workspace: '/tmp' } as ToolContext;
      const result = await tool.execute({ action: 'clear' }, noStateCtx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No canvas state');
    });

    it('add — respects component limit', async () => {
      const limitedState = new CanvasState(1);
      const limitedCtx = makeToolContext(limitedState);

      await tool.execute(
        { action: 'add', component: makeCard('c1'), position: makePosition() },
        limitedCtx,
      );
      const result = await tool.execute(
        { action: 'add', component: makeCard('c2'), position: makePosition() },
        limitedCtx,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('limit reached');
    });
  });

  // -------------------------------------------------------------------------
  // AWM state snapshot
  // -------------------------------------------------------------------------

  describe('getStateSnapshot', () => {
    it('returns state summary', async () => {
      state.addComponent(makeCard('c1'), makePosition());
      state.addComponent(makeChart('c2'), makePosition(400, 200));
      state.addConnection('c1', 'c2');

      const snapshot = await tool.getStateSnapshot!({}, ctx);
      expect(snapshot.timestamp).toBeTruthy();
      expect(snapshot.description).toContain('2 nodes');
      expect(snapshot.description).toContain('1 connections');
      expect((snapshot.state as Record<string, unknown>).nodeCount).toBe(2);
      expect((snapshot.state as Record<string, unknown>).connectionCount).toBe(1);
    });

    it('handles empty canvas', async () => {
      const snapshot = await tool.getStateSnapshot!({}, ctx);
      expect((snapshot.state as Record<string, unknown>).nodeCount).toBe(0);
    });

    it('handles missing canvas state', async () => {
      const noStateCtx = { sessionId: 'test', workspace: '/tmp' } as ToolContext;
      const snapshot = await tool.getStateSnapshot!({}, noStateCtx);
      expect((snapshot.state as Record<string, unknown>).nodeCount).toBe(0);
    });
  });
});

// ============================================================================
// CANVAS CHANNEL
// ============================================================================

describe('CanvasChannel', () => {
  let channel: CanvasChannel;
  let received: InboundMessage[];

  beforeEach(async () => {
    channel = new CanvasChannel();
    received = [];
    channel.onMessage((msg) => received.push(msg));
    await channel.start({ sessionId: 'test-session' });
  });

  describe('metadata', () => {
    it('has correct id and name', () => {
      expect(channel.id).toBe('canvas');
      expect(channel.name).toBe('Canvas');
    });
  });

  describe('lifecycle', () => {
    it('start sets session id', async () => {
      // Already started in beforeEach — verify channel works
      channel.handleClientMessage({ type: 'c2s:message', text: 'hi' });
      expect(received).toHaveLength(1);
      expect(received[0]!.channelId).toBe('test-session');
    });

    it('stop clears handlers', async () => {
      await channel.stop();
      channel.handleClientMessage({ type: 'c2s:message', text: 'hi' });
      expect(received).toHaveLength(0); // Handler cleared
    });
  });

  describe('isHealthy', () => {
    it('returns false when no send function set', async () => {
      expect(await channel.isHealthy()).toBe(false);
    });

    it('returns true when send function is set', async () => {
      channel.setSendFunction(() => {});
      expect(await channel.isHealthy()).toBe(true);
    });
  });

  describe('send', () => {
    it('sends text via injected send function', async () => {
      const sent: unknown[] = [];
      channel.setSendFunction((msg) => sent.push(msg));

      const result = await channel.send(
        { channelId: 'canvas', userId: 'user' },
        { text: 'Hello from agent' },
      );
      expect(result.success).toBe(true);
      expect(result.messageId).toBeTruthy();
      expect(sent).toHaveLength(1);
      expect((sent[0] as { type: string }).type).toBe('s2c:text:complete');
    });

    it('fails when no send function', async () => {
      const result = await channel.send(
        { channelId: 'canvas', userId: 'user' },
        { text: 'No connection' },
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('No WebSocket client connected');
    });
  });

  describe('handleClientMessage', () => {
    it('translates c2s:message to text', () => {
      channel.handleClientMessage({ type: 'c2s:message', text: 'Hello world' });
      expect(received).toHaveLength(1);
      expect(received[0]!.text).toBe('Hello world');
    });

    it('translates c2s:click to [USER_CLICK] format', () => {
      channel.handleClientMessage({
        type: 'c2s:click',
        componentId: 'btn-1',
        actionId: 'submit',
      });
      expect(received).toHaveLength(1);
      expect(received[0]!.text).toContain('[USER_CLICK]');
      expect(received[0]!.text).toContain('btn-1');
      expect(received[0]!.text).toContain('submit');
    });

    it('translates c2s:click without actionId', () => {
      channel.handleClientMessage({
        type: 'c2s:click',
        componentId: 'btn-1',
      });
      expect(received[0]!.text).toBe('[USER_CLICK] Component: btn-1');
    });

    it('translates c2s:input to [USER_INPUT] format', () => {
      channel.handleClientMessage({
        type: 'c2s:input',
        componentId: 'field-1',
        field: 'name',
        value: 'Alice',
      });
      expect(received[0]!.text).toContain('[USER_INPUT]');
      expect(received[0]!.text).toContain('field-1');
      expect(received[0]!.text).toContain('Alice');
    });

    it('translates c2s:form_submit to [FORM_SUBMIT] format', () => {
      channel.handleClientMessage({
        type: 'c2s:form_submit',
        componentId: 'form-1',
        values: { name: 'Alice', age: 30 },
      });
      expect(received[0]!.text).toContain('[FORM_SUBMIT]');
      expect(received[0]!.text).toContain('form-1');
      expect(received[0]!.text).toContain('"name":"Alice"');
    });

    it('translates c2s:select to [USER_SELECT] format', () => {
      channel.handleClientMessage({
        type: 'c2s:select',
        componentIds: ['c1', 'c2', 'c3'],
      });
      expect(received[0]!.text).toContain('[USER_SELECT]');
      expect(received[0]!.text).toContain('c1, c2, c3');
    });

    it('translates c2s:steer to [STEER] format', () => {
      channel.handleClientMessage({
        type: 'c2s:steer',
        message: 'Focus on charts',
        steerType: 'inject',
      });
      expect(received[0]!.text).toContain('[STEER:inject]');
      expect(received[0]!.text).toContain('Focus on charts');
    });

    it('translates c2s:abort to [ABORT] format', () => {
      channel.handleClientMessage({
        type: 'c2s:abort',
        reason: 'User cancelled',
      });
      expect(received[0]!.text).toContain('[ABORT]');
      expect(received[0]!.text).toContain('User cancelled');
    });

    it('abort without reason uses default message', () => {
      channel.handleClientMessage({ type: 'c2s:abort' });
      expect(received[0]!.text).toContain('User requested abort');
    });

    it('ignores c2s:drag (handled by WS bridge directly)', () => {
      channel.handleClientMessage({
        type: 'c2s:drag',
        componentId: 'c1',
        position: { x: 100, y: 200 },
      });
      expect(received).toHaveLength(0);
    });

    it('ignores c2s:ping (handled by WS bridge)', () => {
      channel.handleClientMessage({
        type: 'c2s:ping',
        timestamp: new Date().toISOString(),
      });
      expect(received).toHaveLength(0);
    });

    it('all messages have required InboundMessage fields', () => {
      channel.handleClientMessage({ type: 'c2s:message', text: 'Test' });
      const msg = received[0]!;
      expect(msg.id).toBeTruthy();
      expect(msg.channelId).toBe('test-session');
      expect(msg.from.userId).toBe('canvas-user');
      expect(msg.timestamp).toBeInstanceOf(Date);
      expect(msg.raw).toBeDefined();
    });
  });
});
