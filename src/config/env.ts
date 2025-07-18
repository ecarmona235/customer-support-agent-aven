import { z } from "zod";
import { Logger } from "@/utils/logger";

const logger = new Logger("Config:Env");

// Schema for environment variables
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  QDRANT_URL: z.string().min(1, 'QDRANT_URL is required'),
  QDRANT_COLLECTION_NAME: z.string().min(1, 'QDRANT_COLLECTION_NAME is required'),
  QDRANT_API_KEY: z.string().min(1, 'QDRANT_API_KEY is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
});

// Function to validate environment variables
const validateEnv = () => {
  try {
    logger.info("Validating environment variables");
    const env = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      QDRANT_URL: process.env.QDRANT_URL,
      QDRANT_COLLECTION_NAME: process.env.QDRANT_COLLECTION_NAME,
      QDRANT_API_KEY: process.env.QDRANT_API_KEY,
      REDIS_URL: process.env.REDIS_URL,
    };
    logger.info("Environment variables", { env });
    const parsed = envSchema.parse(env);
    
    logger.info("Environment variables validated successfully");
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map(err => err.path.join("."));
      logger.error("Invalid environment variables", { error: { missingVars } });
      throw new Error(
        `❌ Invalid environment variables: ${missingVars.join(
          ", "
        )}. Please check your .env file`
      );
    }
    throw error;
  }
};

export const env = validateEnv();
