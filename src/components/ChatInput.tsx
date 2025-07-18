'use client';

import { KeyboardEvent } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
  chatEnded?: boolean;
}

export function ChatInput({ value, onChange, onSend, disabled = false, chatEnded = false }: ChatInputProps) {
  console.log('ChatInput render:', { disabled, chatEnded, value });
  
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !disabled && !chatEnded) {
      e.preventDefault();
      onSend(value);
    }
  };

  const handleSend = () => {
    console.log('handleSend called:', { disabled, chatEnded });
    if (!disabled && !chatEnded) {
      onSend(value);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!chatEnded) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="border-t border-gray-600 p-4 bg-gray-800">
      <div className="flex space-x-2">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={chatEnded ? "Chat ended - refresh page to start new conversation" : "Type your message..."}
          disabled={disabled || chatEnded}
          className={`flex-1 px-3 py-2 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-white placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed ${
            chatEnded ? 'border-red-500 bg-gray-600' : ''
          }`}
        />
        <button
          onClick={handleSend}
          disabled={disabled || chatEnded}
          className={`px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
            chatEnded 
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {chatEnded ? 'Chat Ended' : 'Send'}
        </button>
      </div>
    </div>
  );
} 