// eslint-disable-next-line import/no-extraneous-dependencies
import { Pinecone } from '@pinecone-database/pinecone';

import { env } from '../config/env.js';
import { retryWithBackoff } from '../utils/retry.utils.js';

export class PineconeService {
    private index: ReturnType<Pinecone['index']>;

    constructor() {
        const pinecone = new Pinecone({ apiKey: env.PINECONE_API_KEY });
        this.index = pinecone.index(env.PINECONE_INDEX_NAME);
    }

    /**
     * Store content with embedding in Pinecone with retry logic
     */
    async storeContent(embedding: number[], textContent: string, url: string): Promise<void> {
        await retryWithBackoff(async () => {
            await this.index.upsert([
                {
                    id: this.generateId(),
                    values: embedding,
                    metadata: { text: textContent, url, timestamp: new Date().toISOString() },
                },
            ]);
            console.log('✅ Successfully stored in Pinecone:', url);
        });
    }

    /**
     * Generate unique ID for Pinecone records
     */
    private generateId(): string {
        return `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
