/**
 * @ch4p/canvas — A2UI component types, canvas state model, WebSocket
 * protocol, CanvasTool (ITool), and CanvasChannel (IChannel).
 */

// Components
export type {
  ComponentBase,
  ComponentPosition,
  ActionButton,
  ChartData,
  FormField,
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
  A2UIComponent,
  A2UIComponentType,
} from './components.js';
export { isA2UIComponent } from './components.js';

// State model
export type {
  CanvasNode,
  CanvasConnection,
  CanvasSnapshot,
  CanvasChangeType,
  CanvasChange,
  CanvasChangeListener,
} from './state.js';
export { CanvasState } from './state.js';

// Protocol (WebSocket message types)
export type {
  S2CCanvasChange,
  S2CCanvasSnapshot,
  S2CAgentStatus,
  S2CTextDelta,
  S2CTextComplete,
  S2CToolStart,
  S2CToolProgress,
  S2CToolEnd,
  S2CError,
  S2CPong,
  S2CMessage,
  C2SUserMessage,
  C2SUserClick,
  C2SUserInput,
  C2SUserDrag,
  C2SUserSelect,
  C2SFormSubmit,
  C2SAbort,
  C2SSteer,
  C2SPing,
  C2SMessage,
} from './protocol.js';
export { encodeMessage, decodeS2C, decodeC2S, isS2CMessage, isC2SMessage } from './protocol.js';

// Canvas Tool
export type { CanvasToolContext, CanvasToolArgs } from './canvas-tool.js';
export { CanvasTool } from './canvas-tool.js';

// Canvas Channel
export type { CanvasChannelConfig } from './canvas-channel.js';
export { CanvasChannel } from './canvas-channel.js';
