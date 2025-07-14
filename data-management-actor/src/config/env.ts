// eslint-disable-next-line import/no-extraneous-dependencies
import { z } from 'zod';

// Schema for environment variables
const envSchema = z.object({
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    PINECONE_API_KEY: z.string().min(1, 'PINECONE_API_KEY is required'),
    PINECONE_INDEX_NAME: z.string().default('customer-service-data'),
});

// Function to validate environment variables
const validateEnv = () => {
    try {
        const env = {
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            PINECONE_API_KEY: process.env.PINECONE_API_KEY,
            PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME,
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
