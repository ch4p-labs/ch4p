import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { renderMarkdown } from './render-markdown';
import './Chat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/** Exposed handle for parent components (currently unused but available for future needs). */
export interface ChatHandle {
  clearChat: () => void;
}

export const Chat = forwardRef<ChatHandle>(function Chat(_props, ref) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId || undefined }),
      });

      const data = await res.json() as { reply: string; sessionId: string; error?: string };

      if (data.sessionId) setSessionId(data.sessionId);

      const assistantMsg: Message = {
        id: `msg-${Date.now()}-reply`,
        role: data.error ? 'system' : 'assistant',
        content: data.reply,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `msg-${Date.now()}-err`,
          role: 'system',
          content: 'Failed to reach the GUI server. Check if it is running.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSessionId('');
  };

  useImperativeHandle(ref, () => ({ clearChat }));

  return (
    <div className="chat">
      {/* Header */}
      <div className="chat-header">
        <div>
          <h1 className="page-title">Chat</h1>
          <p className="page-subtitle">
            {sessionId ? `Session: ${sessionId.slice(0, 8)}...` : 'Talk to your ch4p agent'}
          </p>
        </div>
        {messages.length > 0 && (
          <button className="chat-clear" onClick={clearChat}>Clear</button>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">◈</div>
            <p>Send a message to start chatting with ch4p.</p>
            <p className="chat-empty-hint">
              Powered by your configured engine. Press Enter to send.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="chat-message-avatar">
              {msg.role === 'user' ? '●' : msg.role === 'assistant' ? '◈' : '!'}
            </div>
            <div className="chat-message-content">
              <div className="chat-message-meta">
                <span className="chat-message-role">
                  {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'ch4p' : 'System'}
                </span>
                <span className="chat-message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="chat-message-body">
                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
              </div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="chat-message assistant">
            <div className="chat-message-avatar">◈</div>
            <div className="chat-message-content">
              <div className="chat-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          disabled={sending}
        />
        <button
          className="chat-send"
          onClick={sendMessage}
          disabled={!input.trim() || sending}
        >
          ↑
        </button>
      </div>
    </div>
  );
});
