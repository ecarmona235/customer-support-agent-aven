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
            const id = `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            console.log('🔍 Storing to Qdrant:', {
                collectionId: env.QDRANT_COLLECTION_NAME,
                embeddingLength: embedding.length,
                textLength: textContent.length,
                url
            });
            
            // Add this check
            if (embedding.length !== 1536) {
                console.error(`❌ Embedding size mismatch: ${embedding.length} vs expected 1536`);
            }
            
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
            
            console.log('🔍 Payload structure:', {
                id,
                vectorLength: embedding.length,
                payloadKeys: Object.keys(payload),
                textPreview: textContent.substring(0, 100)
            });
            
            try {
                await this.client.upsert(env.QDRANT_COLLECTION_NAME, {
                    points: [{
                        id,
                        vector: embedding,
                        payload
                    }]
                });
                console.log('✅ Successfully stored in Qdrant');
            } catch (error) {
                console.error('❌ Qdrant upsert error details:', {
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
                console.log('🔧 Creating collection:', env.QDRANT_COLLECTION_NAME);
                await this.client.createCollection(env.QDRANT_COLLECTION_NAME, {
                    vectors: {
                        size: 1536, // Fixed size for OpenAI embeddings
                        distance: 'Cosine'
                    }
                });
                console.log('✅ Collection created successfully');
            } else {
                console.log('✅ Collection already exists');
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
                console.log('🗑️ Collection deleted');
            } catch (error) {
                console.log('Collection might not exist');
            }
            
            // Create with correct parameters
            console.log('🔧 Creating collection with correct parameters...');
            await this.client.createCollection(env.QDRANT_COLLECTION_NAME, {
                vectors: {
                    size: 1536,
                    distance: 'Cosine'
                }
            });
            console.log('✅ Collection created successfully');
        } catch (error) {
            console.error('❌ Error:', error);
            throw error;
        }
    }
}
