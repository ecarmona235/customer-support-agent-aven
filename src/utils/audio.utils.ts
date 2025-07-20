export interface AudioFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  encoding: string;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
  format: AudioFormat;
}

export class AudioUtils {
  /**
   * Convert audio buffer to different sample rate
   */
  static resample(audioBuffer: Buffer, fromSampleRate: number, toSampleRate: number): Buffer {
    if (fromSampleRate === toSampleRate) {
      return audioBuffer;
    }

    // Simple linear interpolation resampling
    // For production, you might want to use a more sophisticated resampling library
    const ratio = fromSampleRate / toSampleRate;
    const newLength = Math.floor(audioBuffer.length / ratio);
    const newBuffer = Buffer.alloc(newLength);

    for (let i = 0; i < newLength; i++) {
      const oldIndex = i * ratio;
      const oldIndexFloor = Math.floor(oldIndex);
      const oldIndexCeil = Math.min(oldIndexFloor + 1, audioBuffer.length - 1);
      const fraction = oldIndex - oldIndexFloor;

      const sample1 = audioBuffer[oldIndexFloor] || 0;
      const sample2 = audioBuffer[oldIndexCeil] || 0;
      
      newBuffer[i] = Math.round(sample1 * (1 - fraction) + sample2 * fraction);
    }

    return newBuffer;
  }

  /**
   * Convert mono to stereo or vice versa
   */
  static convertChannels(audioBuffer: Buffer, fromChannels: number, toChannels: number): Buffer {
    if (fromChannels === toChannels) {
      return audioBuffer;
    }

    if (fromChannels === 1 && toChannels === 2) {
      // Mono to stereo
      const newBuffer = Buffer.alloc(audioBuffer.length * 2);
      for (let i = 0; i < audioBuffer.length; i++) {
        newBuffer[i * 2] = audioBuffer[i];
        newBuffer[i * 2 + 1] = audioBuffer[i];
      }
      return newBuffer;
    } else if (fromChannels === 2 && toChannels === 1) {
      // Stereo to mono (average channels)
      const newBuffer = Buffer.alloc(audioBuffer.length / 2);
      for (let i = 0; i < newBuffer.length; i++) {
        const left = audioBuffer[i * 2] || 0;
        const right = audioBuffer[i * 2 + 1] || 0;
        newBuffer[i] = Math.round((left + right) / 2);
      }
      return newBuffer;
    }

    return audioBuffer;
  }

  /**
   * Convert audio buffer to 16-bit PCM format
   */
  static toPCM16(audioBuffer: Buffer, sampleRate: number = 16000, channels: number = 1): Buffer {
    try {
      // Check if already 16-bit PCM
      if (this.isPCM16(audioBuffer)) {
        return audioBuffer;
      }

      // For now, assume the buffer is in a compatible format
      // In a real implementation, you would need to:
      // 1. Detect the input format
      // 2. Convert to 16-bit PCM
      // 3. Handle different bit depths (8-bit, 24-bit, 32-bit float)
      
      // Basic validation
      if (audioBuffer.length === 0) {
        throw new Error('Empty audio buffer');
      }

      // If buffer length is even, assume it's already 16-bit PCM
      if (audioBuffer.length % 2 === 0) {
        return audioBuffer;
      }

      // If odd length, pad with zero (basic fix)
      const paddedBuffer = Buffer.alloc(audioBuffer.length + 1, 0);
      audioBuffer.copy(paddedBuffer);
      return paddedBuffer;

    } catch (error) {
      console.error('Error converting to PCM16:', error);
      throw new Error(`Failed to convert to PCM16: ${error}`);
    }
  }

  /**
   * Check if buffer is 16-bit PCM
   */
  private static isPCM16(audioBuffer: Buffer): boolean {
    // Basic check: even number of bytes (16-bit = 2 bytes per sample)
    return audioBuffer.length % 2 === 0;
  }

  /**
   * Split audio buffer into chunks
   */
  static chunkAudio(audioBuffer: Buffer, chunkSizeMs: number, sampleRate: number = 16000, channels: number = 1): Buffer[] {
    const bytesPerSample = 2; // 16-bit
    const bytesPerFrame = bytesPerSample * channels;
    const samplesPerChunk = Math.floor((sampleRate * chunkSizeMs) / 1000);
    const bytesPerChunk = samplesPerChunk * bytesPerFrame;

    const chunks: Buffer[] = [];
    
    for (let i = 0; i < audioBuffer.length; i += bytesPerChunk) {
      const chunk = audioBuffer.slice(i, i + bytesPerChunk);
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }

  /**
   * Merge audio chunks into a single buffer
   */
  static mergeChunks(chunks: Buffer[]): Buffer {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const mergedBuffer = Buffer.alloc(totalLength);
    
    let offset = 0;
    for (const chunk of chunks) {
      chunk.copy(mergedBuffer, offset);
      offset += chunk.length;
    }

    return mergedBuffer;
  }

  /**
   * Add silence to audio buffer
   */
  static addSilence(audioBuffer: Buffer, silenceMs: number, sampleRate: number = 16000, channels: number = 1): Buffer {
    const bytesPerSample = 2; // 16-bit
    const bytesPerFrame = bytesPerSample * channels;
    const silenceSamples = Math.floor((sampleRate * silenceMs) / 1000);
    const silenceBytes = silenceSamples * bytesPerFrame;
    
    const silenceBuffer = Buffer.alloc(silenceBytes, 0);
    return Buffer.concat([audioBuffer, silenceBuffer]);
  }

  /**
   * Normalize audio buffer
   */
  static normalize(audioBuffer: Buffer, targetLevel: number = 0.8): Buffer {
    // Find the maximum amplitude
    let maxAmplitude = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      const amplitude = Math.abs(audioBuffer[i] - 128); // Assuming 8-bit unsigned
      if (amplitude > maxAmplitude) {
        maxAmplitude = amplitude;
      }
    }

    if (maxAmplitude === 0) {
      return audioBuffer;
    }

    // Calculate scaling factor
    const scaleFactor = (targetLevel * 128) / maxAmplitude;
    
    // Apply normalization
    const normalizedBuffer = Buffer.alloc(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      const normalized = Math.round((audioBuffer[i] - 128) * scaleFactor + 128);
      normalizedBuffer[i] = Math.max(0, Math.min(255, normalized));
    }

    return normalizedBuffer;
  }

  /**
   * Convert audio buffer to base64 for WebSocket transmission
   */
  static toBase64(audioBuffer: Buffer): string {
    return audioBuffer.toString('base64');
  }

  /**
   * Convert base64 string back to audio buffer
   */
  static fromBase64(base64String: string): Buffer {
    return Buffer.from(base64String, 'base64');
  }

  /**
   * Get audio duration in milliseconds
   */
  static getDuration(audioBuffer: Buffer, sampleRate: number = 16000, channels: number = 1): number {
    const bytesPerSample = 2; // 16-bit
    const bytesPerFrame = bytesPerSample * channels;
    const totalSamples = audioBuffer.length / bytesPerFrame;
    return (totalSamples / sampleRate) * 1000;
  }

  /**
   * Create a test tone (sine wave)
   */
  static createTestTone(frequency: number = 440, durationMs: number = 1000, sampleRate: number = 16000): Buffer {
    const samples = Math.floor((sampleRate * durationMs) / 1000);
    const buffer = Buffer.alloc(samples * 2); // 16-bit samples
    
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * frequency * t);
      const value = Math.round(sample * 16384 + 16384); // Convert to 16-bit unsigned
      
      buffer[i * 2] = value & 0xFF;
      buffer[i * 2 + 1] = (value >> 8) & 0xFF;
    }
    
    return buffer;
  }
} 