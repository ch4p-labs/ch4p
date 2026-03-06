/**
 * MessageBubble — Renders a single chat message (user or assistant).
 *
 * Assistant messages are parsed as lightweight markdown (bold, code, lists, etc.).
 * User messages render as plain text.
 */

import { renderMarkdown } from './render-markdown';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  text: string;
  isStreaming?: boolean;
}

export function MessageBubble({ role, text, isStreaming }: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${role}`}>
      <div className="message-content">
        {role === 'assistant' ? renderMarkdown(text) : text}
        {isStreaming && <span className="streaming-cursor" />}
      </div>
    </div>
  );
}
