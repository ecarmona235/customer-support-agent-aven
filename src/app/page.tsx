'use client';

import { useState } from 'react';
import { ChatWindow } from "@/components/ChatWindow";
import VoiceChat from "@/components/VoiceChat";

export default function Home() {
  const [showChat, setShowChat] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-white">Customer Agent</h1>
        
        {showChat ? (
          <div className="bg-gray-800 rounded-xl shadow-xl h-[600px] overflow-hidden">
            <ChatWindow />
          </div>
        ) : (
          <div className="flex justify-center">
            <button
              onClick={() => setShowChat(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 text-lg font-medium"
            >
              💬 Chat with Customer Support Agent
            </button>
          </div>
        )}
        
        <div className="mt-8 text-center">
          <h2 className="text-xl text-gray-300 mb-4">Voice Chat</h2>
          <div className="bg-gray-800 rounded-xl shadow-xl p-6 max-w-md mx-auto">
            <VoiceChat 
              sessionId={sessionId}
              onError={(error) => console.error('Voice chat error:', error)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
