import { SpeechClient } from '@google-cloud/speech';

export interface SpeechConfig {
  languageCode?: string;
  sampleRateHertz?: number;
  encoding?: string;
  enableAutomaticPunctuation?: boolean;
  enableWordTimeOffsets?: boolean;
  enableWordConfidence?: boolean;
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{
    transcript: string;
    confidence: number;
  }>;
}

export class SpeechService {
  private client: SpeechClient;
  private config: SpeechConfig;

  constructor(config: SpeechConfig = {}) {
    this.client = new SpeechClient();
    this.config = {
      languageCode: 'en-US',
      sampleRateHertz: 16000,
      encoding: 'LINEAR16',
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: false,
      enableWordConfidence: false,
      ...config
    };
  }

  /**
   * Create a streaming recognition request
   */
  createStreamingRecognize() {
    const request = {
      config: {
        encoding: this.config.encoding as any,
        sampleRateHertz: this.config.sampleRateHertz,
        languageCode: this.config.languageCode,
        enableAutomaticPunctuation: this.config.enableAutomaticPunctuation,
        enableWordTimeOffsets: this.config.enableWordTimeOffsets,
        enableWordConfidence: this.config.enableWordConfidence,
      },
      interimResults: true,
    };

    return this.client.streamingRecognize(request);
  }

  /**
   * Process audio chunk and return transcription
   */
  async processAudioChunk(audioData: Buffer): Promise<TranscriptionResult | null> {
    try {
      const recognizeStream = this.createStreamingRecognize();
      
      return new Promise((resolve, reject) => {
        let finalResult: TranscriptionResult | null = null;

        recognizeStream.on('data', (response: any) => {
          const result = response.results[0];
          if (result) {
            const transcript = result.alternatives[0]?.transcript || '';
            const confidence = result.alternatives[0]?.confidence || 0;
            const isFinal = result.isFinal;

            finalResult = {
              transcript,
              confidence,
              isFinal,
              alternatives: result.alternatives?.map((alt: any) => ({
                transcript: alt.transcript || '',
                confidence: alt.confidence || 0
              }))
            };

            if (isFinal) {
              resolve(finalResult);
            }
          }
        });

        recognizeStream.on('error', (error: any) => {
          console.error('Speech recognition error:', error);
          reject(error);
        });

        recognizeStream.on('end', () => {
          if (!finalResult) {
            resolve(null);
          }
        });

        // Send audio data
        recognizeStream.write({ audioContent: audioData });
        recognizeStream.end();
      });
    } catch (error) {
      console.error('Error processing audio chunk:', error);
      throw error;
    }
  }

  /**
   * Convert audio buffer to proper format for Google Speech
   * Google Speech requires: 16-bit PCM, 16kHz, mono
   * Now handled by client-side conversion
   */
  prepareAudioBuffer(audioBuffer: Buffer): Buffer {
    try {
      // Basic validation - check if buffer has reasonable size
      if (audioBuffer.length < 100) {
        throw new Error('Audio buffer too small');
      }
      
      // Validate that we have 16-bit PCM data
      if (audioBuffer.length % 2 !== 0) {
        throw new Error('Invalid PCM data: buffer length must be even (16-bit samples)');
      }
      
      return audioBuffer;
    } catch (error) {
      console.error('Error preparing audio buffer:', error);
      throw new Error(`Failed to prepare audio buffer: ${error}`);
    }
  }

  /**
   * Check if the service is properly configured
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple request
      const testBuffer = Buffer.alloc(320); // 20ms of silence at 16kHz
      const result = await this.processAudioChunk(testBuffer);
      return true;
    } catch (error) {
      console.error('Speech service connection test failed:', error);
      return false;
    }
  }
} 