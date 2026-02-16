/**
 * @module protocol
 *
 * WebSocket protocol types for canvas communication.
 *
 * All messages are discriminated unions keyed on the `type` field.
 * Server-to-client types are prefixed with `s2c:`, client-to-server
 * with `c2s:`.  Helper functions handle JSON serialisation and
 * direction detection so callers never need to inspect the prefix
 * manually.
 */

import type { ComponentPosition } from './components.js';
import type { CanvasSnapshot, CanvasChange } from './state.js';

// ---------------------------------------------------------------------------
// Server-to-Client (S2C) messages
// ---------------------------------------------------------------------------

/** The canvas state changed (single incremental change). */
export interface S2CCanvasChange {
  type: 's2c:canvas:change';
  change: CanvasChange;
}

/** Full canvas snapshot (sent on initial connect or resync). */
export interface S2CCanvasSnapshot {
  type: 's2c:canvas:snapshot';
  snapshot: CanvasSnapshot;
}

/** Agent execution status update. */
export interface S2CAgentStatus {
  type: 's2c:agent:status';
  status: 'idle' | 'thinking' | 'tool_executing' | 'streaming' | 'complete' | 'error';
  tool?: string;
  message?: string;
}

/** Incremental text streaming delta from the agent. */
export interface S2CTextDelta {
  type: 's2c:text:delta';
  delta: string;
  partial: string;
}

/** Final completed text from the agent. */
export interface S2CTextComplete {
  type: 's2c:text:complete';
  text: string;
}

/** A tool execution has started. */
export interface S2CToolStart {
  type: 's2c:tool:start';
  tool: string;
  data?: unknown;
}

/** Progress update from a running tool. */
export interface S2CToolProgress {
  type: 's2c:tool:progress';
  tool: string;
  data?: unknown;
}

/** A tool execution has ended. */
export interface S2CToolEnd {
  type: 's2c:tool:end';
  tool: string;
  data?: unknown;
}

/** Server-side error. */
export interface S2CError {
  type: 's2c:error';
  code: string;
  message: string;
}

/** Pong response to a client ping. */
export interface S2CPong {
  type: 's2c:pong';
  timestamp: string;
}

/** Discriminated union of every server-to-client message. */
export type S2CMessage =
  | S2CCanvasChange
  | S2CCanvasSnapshot
  | S2CAgentStatus
  | S2CTextDelta
  | S2CTextComplete
  | S2CToolStart
  | S2CToolProgress
  | S2CToolEnd
  | S2CError
  | S2CPong;

// ---------------------------------------------------------------------------
// Client-to-Server (C2S) messages
// ---------------------------------------------------------------------------

/** Free-form text message from the user. */
export interface C2SUserMessage {
  type: 'c2s:message';
  text: string;
}

/** User clicked a canvas component (button, card, etc.). */
export interface C2SUserClick {
  type: 'c2s:click';
  componentId: string;
  actionId?: string;
}

/** User typed into an input component. */
export interface C2SUserInput {
  type: 'c2s:input';
  componentId: string;
  field?: string;
  value: string;
}

/** User dragged a component to a new position. */
export interface C2SUserDrag {
  type: 'c2s:drag';
  componentId: string;
  position: ComponentPosition;
}

/** User selected one or more components. */
export interface C2SUserSelect {
  type: 'c2s:select';
  componentIds: string[];
}

/** User submitted a form component. */
export interface C2SFormSubmit {
  type: 'c2s:form_submit';
  componentId: string;
  values: Record<string, unknown>;
}

/** User requested abort of the current agent run. */
export interface C2SAbort {
  type: 'c2s:abort';
  reason?: string;
}

/** Steering message — inject guidance into the running agent. */
export interface C2SSteer {
  type: 'c2s:steer';
  message: string;
  steerType: 'inject' | 'priority' | 'context_update';
}

/** Client ping for connection keep-alive. */
export interface C2SPing {
  type: 'c2s:ping';
  timestamp: string;
}

/** Discriminated union of every client-to-server message. */
export type C2SMessage =
  | C2SUserMessage
  | C2SUserClick
  | C2SUserInput
  | C2SUserDrag
  | C2SUserSelect
  | C2SFormSubmit
  | C2SAbort
  | C2SSteer
  | C2SPing;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Serialise a protocol message to a JSON string for transmission.
 */
export function encodeMessage(msg: S2CMessage | C2SMessage): string {
  return JSON.stringify(msg);
}

/**
 * Deserialise a raw JSON string into a server-to-client message.
 */
export function decodeS2C(raw: string): S2CMessage {
  return JSON.parse(raw) as S2CMessage;
}

/**
 * Deserialise a raw JSON string into a client-to-server message.
 */
export function decodeC2S(raw: string): C2SMessage {
  return JSON.parse(raw) as C2SMessage;
}

/**
 * Type guard: is the value a server-to-client message?
 */
export function isS2CMessage(msg: unknown): msg is S2CMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as Record<string, unknown>)['type'] === 'string' &&
    ((msg as Record<string, unknown>)['type'] as string).startsWith('s2c:')
  );
}

/**
 * Type guard: is the value a client-to-server message?
 */
export function isC2SMessage(msg: unknown): msg is C2SMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as Record<string, unknown>)['type'] === 'string' &&
    ((msg as Record<string, unknown>)['type'] as string).startsWith('c2s:')
  );
}
