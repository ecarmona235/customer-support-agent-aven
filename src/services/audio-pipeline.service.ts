import { SpeechService, TranscriptionResult } from './speech.service';
import { TTSService, TTSResponse } from './tts.service';
import { AudioUtils, AudioChunk } from '../utils/audio.utils';

export interface AudioPipelineConfig {
  speechConfig?: any;
  ttsConfig?: any;
  chunkSizeMs?: number;
  sampleRate?: number;
  channels?: number;
  enableRealTimeProcessing?: boolean;
  enableAudioOptimization?: boolean;
}

export interface AudioProcessingResult {
  transcript: string;
  confidence: number;
  audioResponse?: Buffer;
  error?: string;
  processingTime?: number;
}

export class AudioPipelineService {
  private speechService: SpeechService;
  private ttsService: TTSService;
  private config: AudioPipelineConfig;
  private audioChunks: Map<string, Buffer[]> = new Map();
  private processingSessions: Set<string> = new Set();
  private sessionStats: Map<string, any> = new Map();

  constructor(
    elevenLabsApiKey: string,
    config: AudioPipelineConfig = {}
  ) {
    this.config = {
      chunkSizeMs: 100,
      sampleRate: 16000,
      channels: 1,
      enableRealTimeProcessing: true,
      enableAudioOptimization: true,
      ...config
    };

    this.speechService = new SpeechService(this.config.speechConfig);
    this.ttsService = new TTSService(elevenLabsApiKey, this.config.ttsConfig);
  }

  /**
   * Process incoming audio chunk from client
   * Client-side conversion should provide 16-bit PCM data
   */
  async processAudioChunk(sessionId: string, audioData: Buffer): Promise<AudioProcessingResult | null> {
    const startTime = Date.now();
    
    try {
      // Validate incoming audio format
      const validationResult = this.validateAudioFormat(audioData);
      if (!validationResult.isValid) {
        throw new Error(`Invalid audio format: ${validationResult.error}`);
      }

      // Store audio chunk
      if (!this.audioChunks.has(sessionId)) {
        this.audioChunks.set(sessionId, []);
        this.sessionStats.set(sessionId, {
          totalChunks: 0,
          totalDuration: 0,
          averageChunkSize: 0,
          processingTimes: []
        });
      }
      
      const sessionChunks = this.audioChunks.get(sessionId)!;
      sessionChunks.push(audioData);
      this.updateSessionStats(sessionId, audioData, undefined);

      // Check if we have enough audio to process
      const totalDuration = this.getTotalAudioDuration(sessionId);
      if (totalDuration < 500) { // Wait for at least 500ms of audio
        return null;
      }

      // Process the accumulated audio
      const result = await this.processAccumulatedAudio(sessionId);
      
      if (result) {
        result.processingTime = Date.now() - startTime;
        this.updateSessionStats(sessionId, undefined, result.processingTime);
      }

      return result;
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      return {
        transcript: '',
        confidence: 0,
        error: `Failed to process audio: ${error}`,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Process accumulated audio for a session
   */
  private async processAccumulatedAudio(sessionId: string): Promise<AudioProcessingResult> {
    if (this.processingSessions.has(sessionId)) {
      return { transcript: '', confidence: 0 };
    }

    this.processingSessions.add(sessionId);

    try {
      const chunks = this.audioChunks.get(sessionId) || [];
      if (chunks.length === 0) {
        return { transcript: '', confidence: 0 };
      }

      // Merge audio chunks
      const audioBuffer = AudioUtils.mergeChunks(chunks);
      
      // Optimize audio for speech recognition
      const optimizedAudio = this.optimizeAudioForSpeech(audioBuffer);
      
      // Perform speech recognition
      const transcription = await this.speechService.processAudioChunk(optimizedAudio);
      
      if (!transcription || !transcription.transcript.trim()) {
        // Clear processed chunks
        this.audioChunks.set(sessionId, []);
        this.processingSessions.delete(sessionId);
        return { transcript: '', confidence: 0 };
      }

      // Generate AI response using the chat API
      const aiResponse = await this.generateAIResponse(transcription.transcript, sessionId);
      
      // Convert AI response to speech
      let audioResponse: Buffer | undefined;
      if (aiResponse) {
        const ttsAudio = await this.ttsService.streamTextToSpeech(aiResponse);
        audioResponse = this.optimizeAudioForPlayback(ttsAudio);
      }

      // Clear processed chunks
      this.audioChunks.set(sessionId, []);
      this.processingSessions.delete(sessionId);

      return {
        transcript: transcription.transcript,
        confidence: transcription.confidence,
        audioResponse
      };
    } catch (error) {
      console.error('Error processing accumulated audio:', error);
      this.processingSessions.delete(sessionId);
      return {
        transcript: '',
        confidence: 0,
        error: `Failed to process audio: ${error}`
      };
    }
  }

  /**
   * Validate audio format from client
   */
  private validateAudioFormat(audioBuffer: Buffer): { isValid: boolean; error?: string } {
    // Check buffer size
    if (audioBuffer.length < 100) {
      return { isValid: false, error: 'Audio buffer too small' };
    }

    // Check for 16-bit PCM format (even number of bytes)
    if (audioBuffer.length % 2 !== 0) {
      return { isValid: false, error: 'Invalid PCM data: buffer length must be even' };
    }

    // Check for reasonable audio data (not all zeros or all same value)
    const uniqueValues = new Set(audioBuffer);
    if (uniqueValues.size < 10) {
      return { isValid: false, error: 'Audio data appears to be invalid (too few unique values)' };
    }

    return { isValid: true };
  }

  /**
   * Optimize audio for speech recognition
   */
  private optimizeAudioForSpeech(audioBuffer: Buffer): Buffer {
    if (!this.config.enableAudioOptimization) {
      return audioBuffer;
    }

    let optimizedAudio = audioBuffer;

    // Normalize audio levels
    optimizedAudio = AudioUtils.normalize(optimizedAudio, 0.8);

    // Ensure correct sample rate for Google Speech (16kHz)
    if (this.config.sampleRate !== 16000) {
      optimizedAudio = AudioUtils.resample(optimizedAudio, this.config.sampleRate!, 16000);
    }

    // Ensure mono channel
    if (this.config.channels !== 1) {
      optimizedAudio = AudioUtils.convertChannels(optimizedAudio, this.config.channels!, 1);
    }

    return optimizedAudio;
  }

  /**
   * Optimize audio for playback
   */
  private optimizeAudioForPlayback(audioBuffer: Buffer): Buffer {
    if (!this.config.enableAudioOptimization) {
      return audioBuffer;
    }

    let optimizedAudio = audioBuffer;

    // Normalize audio levels for consistent playback
    optimizedAudio = AudioUtils.normalize(optimizedAudio, 0.9);

    // Add small silence at the beginning for smooth playback
    optimizedAudio = AudioUtils.addSilence(optimizedAudio, 50, 44100, 1);

    return optimizedAudio;
  }

  /**
   * Generate AI response using the chat API
   */
  private async generateAIResponse(transcript: string, sessionId: string): Promise<string | null> {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: transcript,
          sessionId: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API error: ${response.status}`);
      }

      const data = await response.json();
      return data.message || null;
    } catch (error) {
      console.error('Error generating AI response:', error);
      return null;
    }
  }

  /**
   * Get total audio duration for a session
   */
  private getTotalAudioDuration(sessionId: string): number {
    const chunks = this.audioChunks.get(sessionId) || [];
    return AudioUtils.getDuration(Buffer.concat(chunks), this.config.sampleRate, this.config.channels);
  }

  /**
   * Update session statistics
   */
  private updateSessionStats(sessionId: string, audioData: Buffer | undefined, processingTime?: number) {
    const stats = this.sessionStats.get(sessionId) || {
      totalChunks: 0,
      totalDuration: 0,
      averageChunkSize: 0,
      processingTimes: []
    };

    if (audioData) {
      stats.totalChunks++;
      stats.totalDuration += AudioUtils.getDuration(audioData, this.config.sampleRate, this.config.channels);
      stats.averageChunkSize = (stats.averageChunkSize * (stats.totalChunks - 1) + audioData.length) / stats.totalChunks;
    }

    if (processingTime) {
      stats.processingTimes.push(processingTime);
      // Keep only last 10 processing times
      if (stats.processingTimes.length > 10) {
        stats.processingTimes.shift();
      }
    }

    this.sessionStats.set(sessionId, stats);
  }

  /**
   * Clear audio chunks for a session
   */
  clearSession(sessionId: string): void {
    this.audioChunks.delete(sessionId);
    this.processingSessions.delete(sessionId);
    this.sessionStats.delete(sessionId);
  }

  /**
   * Test the audio pipeline
   */
  async testPipeline(): Promise<boolean> {
    try {
      // Test speech service
      const speechTest = await this.speechService.testConnection();
      if (!speechTest) {
        console.error('Speech service test failed');
        return false;
      }

      // Test TTS service
      const ttsTest = await this.ttsService.testConnection();
      if (!ttsTest) {
        console.error('TTS service test failed');
        return false;
      }

      // Test audio processing with a test tone
      const testTone = AudioUtils.createTestTone(440, 1000, this.config.sampleRate);
      const result = await this.processAudioChunk('test-session', testTone);
      
      console.log('Audio pipeline test result:', result);
      return true;
    } catch (error) {
      console.error('Audio pipeline test failed:', error);
      return false;
    }
  }

  /**
   * Get pipeline statistics
   */
  getStats(): any {
    return {
      activeSessions: this.audioChunks.size,
      processingSessions: this.processingSessions.size,
      totalChunks: Array.from(this.audioChunks.values()).reduce((sum, chunks) => sum + chunks.length, 0),
      sessionStats: Object.fromEntries(this.sessionStats)
    };
  }

  /**
   * Get session-specific statistics
   */
  getSessionStats(sessionId: string): any {
    return this.sessionStats.get(sessionId) || null;
  }
} 