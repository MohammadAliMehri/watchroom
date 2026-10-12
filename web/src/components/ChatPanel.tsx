import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import type { ChatMessage } from '../hooks/useRoom';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserName?: string;
  onSendMessage: (text: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentUserName,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="glass-panel rounded-xl flex flex-col h-[520px] lg:h-[calc(100vh-140px)] sticky top-4">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <span>Room Chat</span>
        </h3>
        <span className="text-[11px] text-gray-400">
          Room only
        </span>
      </div>

      {/* Messages List with role="log" & aria-live="polite" (Section 12.7) */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
      >
        {messages.length === 0 ? (
          <div className="my-auto text-center px-4 py-8 text-xs text-gray-400">
            Say hi. Messages here are only visible to people in this room.
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              // Action note (Section 12.5: short and grey, no toast)
              return (
                <div
                  key={msg.id}
                  className="text-center my-1 text-[11px] text-gray-400 italic"
                >
                  {msg.text}
                </div>
              );
            }

            const isOwn = currentUserName && msg.sender === currentUserName;

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  isOwn ? 'self-end items-end' : 'self-start items-start'
                }`}
              >
                {!isOwn && (
                  <span className="text-[11px] font-medium text-gray-400 mb-0.5 ml-1">
                    {msg.sender}
                  </span>
                )}
                <div
                  className={`px-3 py-2 rounded-2xl text-sm break-words shadow-sm ${
                    isOwn
                      ? 'bg-violet-600 text-white rounded-br-none'
                      : 'bg-[#1c2029] text-gray-200 border border-white/5 rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-gray-500 mt-0.5 px-1 tabular-nums">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Message Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex gap-2">
        <input
          type="text"
          placeholder="Send a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          aria-label="Chat message"
          className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          aria-label="Send message"
          className="p-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center justify-center shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
