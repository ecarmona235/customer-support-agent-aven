import axios, { AxiosResponse } from 'axios';

export interface TTSConfig {
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  sampleRate?: number;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface TTSRequest {
  text: string;
  model_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

export interface TTSResponse {
  audio: Buffer;
  format: string;
  sampleRate: number;
}

export class TTSService {
  private apiKey: string;
  private baseUrl: string;
  private config: TTSConfig;

  constructor(apiKey: string, config: TTSConfig = {}) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
    this.config = {
      voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM', // Default voice
      modelId: 'eleven_monolingual_v1',
      outputFormat: 'mp3_44100_128',
      sampleRate: 44100,
      stability: 0.7,
      similarityBoost: 0.75,
      style: 0.7,
      useSpeakerBoost: true,
      ...config
    };
  }

  /**
   * Convert text to speech
   */
  async textToSpeech(text: string): Promise<TTSResponse> {
    try {
      const url = `${this.baseUrl}/text-to-speech/${this.config.voiceId}`;
      
      const requestBody: TTSRequest = {
        text,
        model_id: this.config.modelId,
        voice_settings: {
          stability: this.config.stability,
          similarity_boost: this.config.similarityBoost,
          style: this.config.style,
          use_speaker_boost: this.config.useSpeakerBoost,
        }
      };

      const response: AxiosResponse<Buffer> = await axios.post(url, requestBody, {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        responseType: 'arraybuffer',
      });

      return {
        audio: Buffer.from(response.data),
        format: 'mp3',
        sampleRate: this.config.sampleRate || 44100,
      };
    } catch (error) {
      console.error('TTS error:', error);
      throw new Error(`Failed to convert text to speech: ${error}`);
    }
  }

  /**
   * Stream text to speech (for real-time responses)
   */
  async streamTextToSpeech(text: string): Promise<Buffer> {
    try {
      const url = `${this.baseUrl}/text-to-speech/${this.config.voiceId}/stream`;
      
      const requestBody: TTSRequest = {
        text,
        model_id: this.config.modelId,
        voice_settings: {
          stability: this.config.stability,
          similarity_boost: this.config.similarityBoost,
          style: this.config.style,
          use_speaker_boost: this.config.useSpeakerBoost,
        }
      };

      const response: AxiosResponse<Buffer> = await axios.post(url, requestBody, {
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Streaming TTS error:', error);
      throw new Error(`Failed to stream text to speech: ${error}`);
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        }
      });
      return response.data.voices || [];
    } catch (error) {
      console.error('Error fetching voices:', error);
      throw new Error(`Failed to fetch voices: ${error}`);
    }
  }

  /**
   * Get voice details
   */
  async getVoice(voiceId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.baseUrl}/voices/${voiceId}`, {
        headers: {
          'xi-api-key': this.apiKey,
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching voice:', error);
      throw new Error(`Failed to fetch voice: ${error}`);
    }
  }

  /**
   * Test the TTS service connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testText = 'Hello, this is a test.';
      const result = await this.textToSpeech(testText);
      return result.audio.length > 0;
    } catch (error) {
      console.error('TTS service connection test failed:', error);
      return false;
    }
  }

  /**
   * Convert audio to different format if needed
   */
  convertAudioFormat(audioBuffer: Buffer, targetFormat: string): Buffer {
    // Basic format conversion - you might need more sophisticated audio processing
    // For now, we'll return the original buffer
    return audioBuffer;
  }
} 