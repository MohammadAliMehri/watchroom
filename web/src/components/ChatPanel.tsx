import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Smile } from 'lucide-react';
import type { ChatMessage } from '../hooks/useRoom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserName?: string;
  onSendMessage: (text: string) => void;
}

const QUICK_EMOJIS = ['🍿', '❤️', '🔥', '😂', '👏', '🎉', '😮', '👀'];

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

  const handleEmojiClick = (emoji: string) => {
    onSendMessage(emoji);
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="flex h-[520px] xl:h-[calc(100vh-140px)] flex-col bg-[#10141f]/90 border-white/10 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="p-3.5 border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <span>Room Chat</span>
          <span className="text-[11px] text-gray-500 font-mono font-normal">
            ({messages.filter(m => !m.isSystem).length})
          </span>
        </h3>
        <span className="text-[10px] text-violet-400/80 bg-violet-950/60 border border-violet-500/20 px-2 py-0.5 rounded-full font-medium">
          WebSocket Live
        </span>
      </div>

      {/* Messages List with role="log" & aria-live="polite" */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
      >
        {messages.length === 0 ? (
          <div className="my-auto text-center px-4 py-8 text-xs text-gray-500 flex flex-col items-center gap-2">
            <Smile className="w-8 h-8 opacity-30 text-violet-400" />
            <span>No messages yet.</span>
            <span className="text-[11px] text-gray-600">Send a message or drop a reaction below!</span>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div
                  key={msg.id}
                  className="text-center my-1 text-[11px] text-gray-400/80 italic bg-white/5 py-1 px-2.5 rounded-full mx-auto max-w-fit"
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
                  className={`px-3.5 py-2 rounded-2xl text-sm break-words shadow-sm ${
                    isOwn
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-none shadow-violet-600/20'
                      : 'bg-[#1c2230] text-gray-200 border border-white/5 rounded-bl-none'
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

      {/* Quick Emoji Reaction Bar */}
      <div className="px-3 pt-2 pb-1 border-t border-white/5 flex items-center justify-between gap-1 overflow-x-auto">
        <span className="text-[10px] text-gray-500 mr-1 hidden sm:inline">React:</span>
        <div className="flex items-center gap-1">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleEmojiClick(emoji)}
              className="text-sm p-1 hover:scale-125 transition-transform active:scale-95 rounded-md hover:bg-white/5"
              title={`Send ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Message Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/5 flex gap-2">
        <Input
          type="text"
          placeholder="Send a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          aria-label="Chat message"
          className="h-9 flex-1 rounded-lg border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus-visible:border-violet-500 focus-visible:ring-violet-500"
        />
        <Button
          type="submit"
          disabled={!inputText.trim()}
          aria-label="Send message"
          size="icon"
          className="bg-violet-600 text-white hover:bg-violet-500 shadow-sm shadow-violet-600/30 shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </Card>
  );
};
