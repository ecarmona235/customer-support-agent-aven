/* eslint-disable import/no-extraneous-dependencies */
import 'dotenv/config.js';

import { z } from 'zod';

// Schema for environment variables
const envSchema = z.object({
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    QDRANT_URL: z.string().min(1, 'QDRANT_URL is required'),
    QDRANT_COLLECTION_NAME: z.string().min(1, 'QDRANT_COLLECTION_NAME is required'), // Changed from ID to NAME
    QDRANT_API_KEY: z.string().min(1, 'QDRANT_API_KEY is required'),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1, 'GOOGLE_APPLICATION_CREDENTIALS is required')
});

// Function to validate environment variables
const validateEnv = () => {
    try {
        const env = {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            QDRANT_URL: process.env.QDRANT_URL,
            QDRANT_COLLECTION_NAME: process.env.QDRANT_COLLECTION_NAME, // Changed from ID to NAME
            QDRANT_API_KEY: process.env.QDRANT_API_KEY,
            GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS
        };
        const parsed = envSchema.parse(env);

        console.log('✅ Environment variables validated successfully');
        return parsed;
    } catch (error) {
        if (error instanceof z.ZodError) {
            const missingVars = error.issues.map((err) => err.path.join('.'));
            console.error('❌ Invalid environment variables:', missingVars.join(', '));
            throw new Error(`Missing or invalid environment variables: ${missingVars.join(', ')}`);
        }
        throw error;
    }
};

export const env = validateEnv();
