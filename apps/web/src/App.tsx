import { useState, useCallback, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useCanvasState } from './hooks/useCanvasState';
import { CanvasEditor } from './canvas/CanvasEditor';
import { ChatPanel } from './chat/ChatPanel';
import type { S2CMessage } from '@ch4p/canvas';
import './styles/globals.css';

/** Extract session ID from URL params or use a default. */
function getSessionId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('session') ?? 'default';
}

export function App() {
  const sessionId = useMemo(() => getSessionId(), []);

  // Agent status state
  const [agentStatus, setAgentStatus] = useState<string>('idle');
  const [agentStatusMessage, setAgentStatusMessage] = useState<string>('');

  // Chat messages
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [partialText, setPartialText] = useState('');

  // Canvas state management (processes canvas-specific S2C messages)
  const canvasState = useCanvasState(sessionId);

  // WebSocket handler — processes S2C messages, delegating canvas msgs
  const handleMessage = useCallback((msg: S2CMessage) => {
    switch (msg.type) {
      case 's2c:agent:status':
        setAgentStatus(msg.status);
        setAgentStatusMessage(msg.message ?? '');
        if (msg.status === 'idle' || msg.status === 'complete') {
          setPartialText('');
        }
        break;

      case 's2c:text:delta':
        setPartialText(msg.partial);
        break;

      case 's2c:text:complete':
        setMessages((prev) => [...prev, { role: 'assistant', text: msg.text }]);
        setPartialText('');
        break;

      default:
        // Canvas changes, tool events, etc. — delegate to canvas state handler
        canvasState.handleMessage(msg);
        break;
    }
  }, [canvasState]);

  // WebSocket connection
  const { send, connected } = useWebSocket(sessionId, handleMessage);

  // Send a chat message
  const handleSendMessage = useCallback(
    (text: string) => {
      setMessages((prev) => [...prev, { role: 'user', text }]);
      send({ type: 'c2s:message', text });
    },
    [send],
  );

  // Abort agent
  const handleAbort = useCallback(() => {
    send({ type: 'c2s:abort', reason: 'User requested abort' });
  }, [send]);

  return (
    <div className="app-layout">
      <div className="canvas-area">
        <CanvasEditor
          nodes={canvasState.nodes}
          connections={canvasState.connections}
          onDrag={(componentId, position) => {
            send({ type: 'c2s:drag', componentId, position });
          }}
          onClick={(componentId, actionId) => {
            send({ type: 'c2s:click', componentId, actionId });
          }}
          onFormSubmit={(componentId, values) => {
            send({ type: 'c2s:form_submit', componentId, values });
          }}
        />
      </div>
      <div className="chat-area">
        <ChatPanel
          messages={messages}
          partialText={partialText}
          agentStatus={agentStatus}
          agentStatusMessage={agentStatusMessage}
          connected={connected}
          onSend={handleSendMessage}
          onAbort={handleAbort}
        />
      </div>
    </div>
  );
}
