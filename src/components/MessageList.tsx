'use client';

import { useEffect, useRef } from 'react';
import { Message } from './ChatWindow';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading = false }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-end relative">
      <div className="space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
      <div ref={bottomRef} />
      
      {/* Loading indicator positioned in bottom right */}
      {isLoading && (
        <div className="absolute bottom-4 right-4 flex items-center space-x-2 bg-gray-800 bg-opacity-90 px-3 py-2 rounded-lg border border-gray-600">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span className="text-sm text-gray-300">Assistant is typing...</span>
        </div>
      )}
    </div>
  );
} 