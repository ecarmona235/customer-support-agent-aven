import { QdrantClient } from '@qdrant/js-client-rest';

import { env } from '../config/env.js';
import { retryWithBackoff } from '../utils/retry.utils.js';

export class QdrantService {
    private client: QdrantClient;

    constructor() {
        this.client = new QdrantClient({ 
            url: env.QDRANT_URL,
            apiKey: env.QDRANT_API_KEY 
        });
    }

    async storeContent(embedding: number[], textContent: string, url: string): Promise<void> {
        await retryWithBackoff(async () => {
            const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
            
            // Validate embedding data
            if (!Array.isArray(embedding) || embedding.some(val => typeof val !== 'number' || isNaN(val))) {
                console.error('❌ Invalid embedding data:', embedding.slice(0, 5));
                throw new Error('Invalid embedding data');
            }
            
            const payload = {
                text: textContent,
                url,
                timestamp: new Date().toISOString()
            };
            
            try {
                await this.client.upsert(env.QDRANT_COLLECTION_NAME, {
                    points: [{
                        id,
                        vector: embedding,
                        payload
                    }]
                });
            } catch (error) {
                console.error('❌ Qdrant upsert error:', {
                    error: error instanceof Error ? error.message : String(error),
                    status: (error as any)?.status,
                    details: (error as any)?.details
                });
                throw error;
            }
        });
    }

    async initializeCollection(): Promise<void> {
        try {
            // Check if collection exists first
            const collections = await this.client.getCollections();
            const exists = collections.collections.some(c => c.name === env.QDRANT_COLLECTION_NAME);
            
            if (!exists) {
                await this.client.createCollection(env.QDRANT_COLLECTION_NAME, {
                    vectors: {
                        size: 1536, // Fixed size for OpenAI embeddings
                        distance: 'Cosine'
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error with collection:', error);
            throw error;
        }
    }

    async forceRecreateCollection(): Promise<void> {
        try {
            // Delete if exists
            try {
                await this.client.deleteCollection(env.QDRANT_COLLECTION_NAME);
            } catch (error) {
                // Collection might not exist
            }
            
            // Create with correct parameters
            await this.client.createCollection(env.QDRANT_COLLECTION_NAME, {
                vectors: {
                    size: 1536,
                    distance: 'Cosine'
                }
            });
        } catch (error) {
            console.error('❌ Error recreating collection:', error);
            throw error;
        }
    }
}
