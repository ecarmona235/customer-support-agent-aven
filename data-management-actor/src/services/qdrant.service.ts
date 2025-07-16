import { QdrantClient } from '@qdrant/js-client-rest';

import { env } from '../config/env.js';
import { retryWithBackoff } from '../utils/retry.utils.js';

export class QdrantService {
    private client: QdrantClient;

    constructor() {
        this.client = new QdrantClient({ url: env.QDRANT_URL });
    }

    async storeContent(embedding: number[], textContent: string, url: string): Promise<void> {
        await retryWithBackoff(async () => {
            const id = `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            await this.client.upsert(env.QDRANT_COLLECTION_NAME, {
                points: [{
                    id,
                    vector: embedding,
                    payload: {
                        text: textContent,
                        url,
                        timestamp: new Date().toISOString()
                    }
                }]
            });
        });
    }

    async initializeCollection(): Promise<void> {
        try {
            await this.client.createCollection(env.QDRANT_COLLECTION_NAME, {
                vectors: {
                    size: 1536, // OpenAI embedding size
                    distance: 'Cosine'
                }
            });
        } catch (error) {
            // Collection might already exist
            console.log('❌ Collection might already exist');
            console.log(error);
        }
    }
}
