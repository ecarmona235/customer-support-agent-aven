'use client';

import { useState, useEffect } from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface ChatResponse {
  message: string;
  sessionId: string;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
  };
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [chatEnded, setChatEnded] = useState(false);

  // Generate session ID on component mount
  useEffect(() => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    
    // Add initial welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      content: "Hello! I'm Aven's customer support assistant. How can I help you today?",
      sender: 'assistant',
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
  }, []);

  const handleSendMessage = async (content: string) => {
    console.log('handleSendMessage called:', { content, chatEnded, sessionId });
    
    if (!content.trim() || !sessionId || chatEnded) {
      console.log('Early return:', { hasContent: !!content.trim(), hasSessionId: !!sessionId, chatEnded });
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content.trim(),
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data: ChatResponse = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.message,
        sender: 'assistant',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Check if the assistant's response ends with "Goodbye" to conclude the chat
      if (data.message.trim().endsWith('Goodbye!')) {
        console.log('Goodbye detected! Ending chat...');
        setChatEnded(true);
        
        // Add a final message indicating the chat has ended
        const endMessage: Message = {
          id: (Date.now() + 2).toString(),
          content: 'Chat session ended. Refresh the page to start a new conversation.',
          sender: 'assistant',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, endMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I encountered an error. Please try again.',
        sender: 'assistant',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} isLoading={isLoading} />
      <ChatInput 
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendMessage}
        disabled={isLoading}
        chatEnded={chatEnded}
      />
    </div>
  );
} 