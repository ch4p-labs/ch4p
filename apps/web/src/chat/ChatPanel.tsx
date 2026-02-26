/**
 * ChatPanel — Right-side chat interface for text conversations with the agent.
 */

import { useState, useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { AgentStatusBar } from './AgentStatusBar';
import { SettingsPanel } from '../settings/SettingsPanel';
import '../styles/chat.css';

interface ChatPanelProps {
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  partialText: string;
  agentStatus: string;
  agentStatusMessage: string;
  connected: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
}

export function ChatPanel({
  messages,
  partialText,
  agentStatus,
  agentStatusMessage,
  connected,
  onSend,
  onAbort,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialText]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isWorking = agentStatus === 'thinking' || agentStatus === 'streaming' || agentStatus === 'tool_executing';

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-title">ch4p</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="settings-btn"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </button>
          <div className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <AgentStatusBar status={agentStatus} message={agentStatusMessage} />

      <div className="chat-messages">
        {messages.length === 0 && !partialText && (
          <div className="chat-empty">
            Start a conversation to interact with the canvas.
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} text={msg.text} />
        ))}

        {partialText && <MessageBubble role="assistant" text={partialText} isStreaming />}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {isWorking && (
          <button className="abort-btn" onClick={onAbort}>
            Stop
          </button>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? 'Message ch4p...' : 'Connecting...'}
            disabled={!connected}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={!connected || !input.trim() || isWorking}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
