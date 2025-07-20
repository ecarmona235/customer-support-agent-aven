'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VoiceWebSocket, WebSocketMessage, ConnectionStatus } from '../utils/websocket';

interface VoiceChatProps {
  sessionId: string;
  onError?: (error: string) => void;
}

export default function VoiceChat({ sessionId, onError }: VoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.CLOSED);
  const [error, setError] = useState<string | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);

  const wsRef = useRef<VoiceWebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize WebSocket connection only when voice is enabled
  useEffect(() => {
    if (!isVoiceEnabled) return;

    const initWebSocket = async () => {
      try {
        wsRef.current = new VoiceWebSocket(sessionId);
        
        // Set up message handlers
        wsRef.current.onMessage('connection_established', (message) => {
          console.log('Connection established:', message);
          setIsConnected(true);
          setConnectionStatus(ConnectionStatus.OPEN);
          setError(null);
        });

        wsRef.current.onMessage('streaming_started', (message) => {
          console.log('Streaming started:', message);
          setIsStreaming(true);
        });

        wsRef.current.onMessage('streaming_stopped', (message) => {
          console.log('Streaming stopped:', message);
          setIsStreaming(false);
          stopRecording();
        });

        wsRef.current.onMessage('audio_received', (message) => {
          console.log('Audio received by server:', message);
        });

        wsRef.current.onMessage('error', (message) => {
          console.error('Server error:', message.error);
          setError(message.error || 'Unknown server error');
          if (onError) onError(message.error || 'Unknown server error');
        });

        wsRef.current.onMessage('pong', (message) => {
          console.log('Pong received:', message);
        });

        // Connect to WebSocket
        await wsRef.current.connect();
        
      } catch (error) {
        console.error('Failed to initialize WebSocket:', error);
        setError('Failed to connect to voice server');
        if (onError) onError('Failed to connect to voice server');
      }
    };

    initWebSocket();

    // Cleanup when voice is disabled
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
      setIsConnected(false);
      setIsStreaming(false);
      setIsRecording(false);
      setConnectionStatus(ConnectionStatus.CLOSED);
    };
  }, [sessionId, onError, isVoiceEnabled]);

  // Start voice streaming
  const startStreaming = async () => {
    if (!wsRef.current || !isConnected) {
      setError('Not connected to voice server');
      return;
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Handle audio data
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          // Send audio blob directly - it will be converted to PCM
          if (wsRef.current && isStreaming) {
            try {
              await wsRef.current.sendAudioData(event.data);
            } catch (error) {
              console.error('Error sending audio data:', error);
              setError('Failed to send audio data');
            }
          }
        }
      };

      // Start recording
      mediaRecorder.start(100); // Send chunks every 100ms
      setIsRecording(true);

      // Tell server to start streaming
      wsRef.current.startStreaming();

    } catch (error) {
      console.error('Failed to start streaming:', error);
      setError('Failed to access microphone');
      if (onError) onError('Failed to access microphone');
    }
  };

  // Stop voice streaming
  const stopStreaming = async () => {
    if (!wsRef.current) return;

    try {
      // Stop recording
      stopRecording();

      // Tell server to stop streaming
      wsRef.current.stopStreaming();

    } catch (error) {
      console.error('Failed to stop streaming:', error);
      setError('Failed to stop streaming');
      if (onError) onError('Failed to stop streaming');
    }
  };

  // Stop recording helper
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  // Get connection status text
  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTING:
        return 'Connecting...';
      case ConnectionStatus.OPEN:
        return 'Connected';
      case ConnectionStatus.CLOSING:
        return 'Disconnecting...';
      case ConnectionStatus.CLOSED:
        return 'Disconnected';
      default:
        return 'Unknown';
    }
  };

  // Enable voice chat
  const enableVoiceChat = () => {
    setIsVoiceEnabled(true);
    setError(null);
  };

  // End voice chat
  const endVoiceChat = () => {
    setIsVoiceEnabled(false);
    if (isRecording) {
      stopRecording();
    }
    if (isStreaming) {
      wsRef.current?.stopStreaming();
    }
  };

  // Get button text
  const getButtonText = () => {
    if (!isVoiceEnabled) return 'Start Voice Call';
    if (!isConnected) return 'Connecting...';
    if (isStreaming && isRecording) return 'Stop Voice Chat';
    if (isStreaming) return 'Starting...';
    return 'Start Voice Chat';
  };

  // Get button disabled state
  const isButtonDisabled = () => {
    if (!isVoiceEnabled) return false; // Enable button to start voice call
    return !isConnected || (isStreaming && !isRecording);
  };

  return (
    <div className="p-4 border border-gray-600 rounded-lg bg-gray-700 shadow-sm">
      <h3 className="text-lg font-semibold mb-4 text-white">Voice Chat</h3>
      
      {/* Connection Status */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <div 
            className={`w-3 h-3 rounded-full ${
              !isVoiceEnabled ? 'bg-gray-400' : isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-300">
            {!isVoiceEnabled ? 'Voice Call Disabled' : getConnectionStatusText()}
          </span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-500 rounded-md">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Voice Chat Controls */}
      <div className="space-y-3">
        {!isVoiceEnabled ? (
          <button
            onClick={enableVoiceChat}
            className="w-full py-2 px-4 rounded-md font-medium transition-colors bg-green-500 hover:bg-green-600 text-white"
          >
            {getButtonText()}
          </button>
        ) : (
          <>
            <button
              onClick={isStreaming ? stopStreaming : startStreaming}
              disabled={isButtonDisabled()}
              className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${
                isStreaming && isRecording
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : isConnected
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {getButtonText()}
            </button>
            
            <button
              onClick={endVoiceChat}
              className="w-full py-2 px-4 rounded-md font-medium transition-colors bg-gray-500 hover:bg-gray-600 text-white"
            >
              End Voice Call
            </button>
          </>
        )}

        {/* Recording Indicator */}
        {isRecording && (
          <div className="flex items-center justify-center gap-2 p-2 bg-red-900/20 border border-red-500 rounded-md">
            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
            <span className="text-sm text-red-400">Recording...</span>
          </div>
        )}

        {/* Streaming Status */}
        {isStreaming && !isRecording && (
          <div className="flex items-center justify-center gap-2 p-2 bg-blue-900/20 border border-blue-500 rounded-md">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-sm text-blue-400">Starting voice chat...</span>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-gray-600/20 border border-gray-500 rounded-md">
        <p className="text-xs text-gray-300">
          {!isVoiceEnabled 
            ? 'Click "Start Voice Call" to enable voice chat functionality. This will connect to the voice server and request microphone access.'
            : 'Click "Start Voice Chat" to begin speaking. Your voice will be sent to the AI assistant in real-time.'
          }
        </p>
      </div>
    </div>
  );
} 