const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');

// Import audio processing services
const { AudioPipelineService } = require('./src/services/audio-pipeline.service');
const { AudioUtils } = require('./src/utils/audio.utils');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.WS_HOSTNAME || 'localhost';
const port = process.env.WS_PORT || process.env.PORT || 3000;

// Prepare the Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// WebSocket connection management
const connections = new Map();

// WebSocket configuration from environment
const maxReconnectAttempts = parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS) || 5;
const reconnectDelay = parseInt(process.env.WS_RECONNECT_DELAY) || 1000;
const pingInterval = parseInt(process.env.WS_PING_INTERVAL) || 30000;

// Initialize audio pipeline
let audioPipeline;
try {
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenLabsApiKey) {
    console.warn('ELEVENLABS_API_KEY not found, audio processing will be disabled');
  } else {
    audioPipeline = new AudioPipelineService(elevenLabsApiKey, {
      chunkSizeMs: 100,
      sampleRate: 16000,
      channels: 1,
      enableRealTimeProcessing: true,
      enableAudioOptimization: true
    });
    console.log('Audio pipeline initialized successfully');
  }
} catch (error) {
  console.error('Failed to initialize audio pipeline:', error);
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ 
    server,
    path: '/api/voice'
  });

  // WebSocket connection handling
  wss.on('connection', (ws, req) => {
    const sessionId = req.headers['x-session-id'] || `session_${Date.now()}`;
    console.log(`WebSocket connected: ${sessionId}`);
    
    // Store connection with session ID
    connections.set(sessionId, ws);

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      sessionId,
      timestamp: Date.now()
    }));

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`Received message from ${sessionId}:`, message.type);

        switch (message.type) {
          case 'session_init':
            // Handle session initialization
            await handleSessionInit(sessionId, message);
            break;
          
          case 'audio_data':
            // Handle incoming audio data
            await handleAudioData(sessionId, message.data);
            break;
          
          case 'start_streaming':
            // Handle start streaming request
            await handleStartStreaming(sessionId, message);
            break;
          
          case 'stop_streaming':
            // Handle stop streaming request
            await handleStopStreaming(sessionId);
            break;
          
          case 'ping':
            // Respond to ping with pong
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          
          default:
            console.warn(`Unknown message type: ${message.type}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to process message',
          timestamp: Date.now()
        }));
      }
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
      console.log(`WebSocket disconnected: ${sessionId} (${code}: ${reason})`);
      connections.delete(sessionId);
      
      // Clean up audio pipeline session
      if (audioPipeline) {
        audioPipeline.clearSession(sessionId);
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for ${sessionId}:`, error);
      connections.delete(sessionId);
    });
  });

  // Start the server
  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server running on ws://${hostname}:${port}/api/voice`);
    console.log(`> Environment: ${dev ? 'development' : 'production'}`);
    console.log(`> WebSocket path: /api/voice`);
    console.log(`> Max reconnect attempts: ${maxReconnectAttempts}`);
    console.log(`> Reconnect delay: ${reconnectDelay}ms`);
    console.log(`> Ping interval: ${pingInterval}ms`);
    console.log(`> Audio pipeline: ${audioPipeline ? 'ENABLED' : 'DISABLED'}`);
    if (audioPipeline) {
      console.log(`> Audio processing: Real-time enabled, Optimization enabled`);
    }
  });
});

// Audio data handling
async function handleAudioData(sessionId, audioData) {
  const ws = connections.get(sessionId);
  if (!ws) return;

  try {
    if (!audioPipeline) {
      console.warn('Audio pipeline not available');
      ws.send(JSON.stringify({
        type: 'audio_received',
        timestamp: Date.now()
      }));
      return;
    }

    // Convert base64 audio data to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Process audio through the pipeline
    const result = await audioPipeline.processAudioChunk(sessionId, audioBuffer);
    
    if (result && result.transcript) {
      console.log(`Transcription for ${sessionId}: ${result.transcript}`);
      
      // Send transcription back to client
      ws.send(JSON.stringify({
        type: 'transcription',
        transcript: result.transcript,
        confidence: result.confidence,
        timestamp: Date.now()
      }));

      // If we have an AI response with audio, send it back
      if (result.audioResponse) {
        const audioBase64 = result.audioResponse.toString('base64');
        ws.send(JSON.stringify({
          type: 'audio_response',
          audio: audioBase64,
          timestamp: Date.now()
        }));
      }
    } else {
      // Just acknowledge receipt
      ws.send(JSON.stringify({
        type: 'audio_received',
        timestamp: Date.now()
      }));
    }
  } catch (error) {
    console.error('Error handling audio data:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to process audio data',
      timestamp: Date.now()
    }));
  }
}

// Start streaming handler
async function handleStartStreaming(sessionId, message) {
  const ws = connections.get(sessionId);
  if (!ws) return;

  try {
    // Initialize streaming session
    console.log(`Starting streaming for session: ${sessionId}`);
    
    ws.send(JSON.stringify({
      type: 'streaming_started',
      sessionId,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Error starting streaming:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to start streaming',
      timestamp: Date.now()
    }));
  }
}

// Stop streaming handler
async function handleStopStreaming(sessionId) {
  const ws = connections.get(sessionId);
  if (!ws) return;

  try {
    console.log(`Stopping streaming for session: ${sessionId}`);
    
    ws.send(JSON.stringify({
      type: 'streaming_stopped',
      sessionId,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Error stopping streaming:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to stop streaming',
      timestamp: Date.now()
    }));
  }
}

// Session initialization handler
async function handleSessionInit(sessionId, message) {
  const ws = connections.get(sessionId);
  if (!ws) return;

  try {
    console.log(`Session initialized: ${sessionId}`);
    
    // Send connection established confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      sessionId,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Error initializing session:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Failed to initialize session',
      timestamp: Date.now()
    }));
  }
}

// Export for potential use in other modules
module.exports = { connections }; 