export interface AudioFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

export interface ConversionOptions {
  targetSampleRate?: number;
  targetChannels?: number;
  targetBitDepth?: number;
}

export class AudioConverter {
  private audioContext: AudioContext | null = null;
  private targetFormat: AudioFormat;

  constructor(options: ConversionOptions = {}) {
    this.targetFormat = {
      sampleRate: options.targetSampleRate || 16000,
      channels: options.targetChannels || 1,
      bitDepth: options.targetBitDepth || 16
    };
  }

  /**
   * Initialize audio context
   */
  private async getAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ 
        sampleRate: this.targetFormat.sampleRate 
      });
    }
    return this.audioContext;
  }

  /**
   * Convert audio blob to 16-bit PCM buffer
   */
  async convertAudioBlobToPCM(audioBlob: Blob): Promise<ArrayBuffer> {
    try {
      const audioContext = await this.getAudioContext();
      
      // Decode the audio blob
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to mono if needed
      const monoBuffer = this.convertToMono(audioBuffer);
      
      // Convert to 16-bit PCM
      const pcmBuffer = this.convertToPCM16(monoBuffer);
      
      return pcmBuffer;
    } catch (error) {
      console.error('Error converting audio blob to PCM:', error);
      throw new Error(`Failed to convert audio: ${error}`);
    }
  }

  /**
   * Convert audio buffer to mono
   */
  private convertToMono(audioBuffer: AudioBuffer): AudioBuffer {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer;
    }

    const monoBuffer = new AudioContext().createBuffer(
      1, // mono
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const monoChannel = monoBuffer.getChannelData(0);
    
    // Mix all channels to mono
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i];
      }
      monoChannel[i] = sum / audioBuffer.numberOfChannels;
    }

    return monoBuffer;
  }

  /**
   * Convert audio buffer to 16-bit PCM
   */
  private convertToPCM16(audioBuffer: AudioBuffer): ArrayBuffer {
    const samples = audioBuffer.length;
    const pcmBuffer = new ArrayBuffer(samples * 2); // 16-bit = 2 bytes per sample
    const view = new DataView(pcmBuffer);

    for (let i = 0; i < samples; i++) {
      // Get sample value (-1.0 to 1.0)
      const sample = audioBuffer.getChannelData(0)[i];
      
      // Convert to 16-bit integer (-32768 to 32767)
      const pcmSample = Math.max(-1, Math.min(1, sample));
      const intSample = Math.round(pcmSample * 32767);
      
      // Write as little-endian 16-bit integer
      view.setInt16(i * 2, intSample, true);
    }

    return pcmBuffer;
  }

  /**
   * Convert MediaRecorder data to PCM
   */
  async convertMediaRecorderData(data: Blob): Promise<ArrayBuffer> {
    return this.convertAudioBlobToPCM(data);
  }

  /**
   * Convert audio chunks from MediaRecorder to PCM
   */
  async convertAudioChunks(chunks: Blob[]): Promise<ArrayBuffer> {
    try {
      // Combine all chunks into a single blob
      const combinedBlob = new Blob(chunks, { type: 'audio/webm' });
      return await this.convertAudioBlobToPCM(combinedBlob);
    } catch (error) {
      console.error('Error converting audio chunks:', error);
      throw new Error(`Failed to convert audio chunks: ${error}`);
    }
  }

  /**
   * Convert Float32Array to 16-bit PCM
   */
  convertFloat32ToPCM16(float32Array: Float32Array): ArrayBuffer {
    const pcmBuffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(pcmBuffer);

    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      const intSample = Math.round(sample * 32767);
      view.setInt16(i * 2, intSample, true);
    }

    return pcmBuffer;
  }

  /**
   * Get audio format information
   */
  getAudioFormat(audioBuffer: AudioBuffer): AudioFormat {
    return {
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      bitDepth: 32 // AudioBuffer uses 32-bit float
    };
  }

  /**
   * Check if audio format matches target
   */
  isTargetFormat(audioBuffer: AudioBuffer): boolean {
    const format = this.getAudioFormat(audioBuffer);
    return (
      format.sampleRate === this.targetFormat.sampleRate &&
      format.channels === this.targetFormat.channels
    );
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
} 