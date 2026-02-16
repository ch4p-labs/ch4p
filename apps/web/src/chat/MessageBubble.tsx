/**
 * MessageBubble — Renders a single chat message (user or assistant).
 */

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  text: string;
  isStreaming?: boolean;
}

export function MessageBubble({ role, text, isStreaming }: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${role}`}>
      <div className="message-content">
        {text}
        {isStreaming && <span className="streaming-cursor" />}
      </div>
    </div>
  );
}
