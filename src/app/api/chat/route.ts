import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAIEmbeddings } from '@langchain/openai';
import { z } from 'zod';
import { env } from '@/config/env';
import { 
  createChatSession, 
  getChatSession, 
  addMessageToSession, 
  checkRateLimit, 
  incrementRateLimit,
  updateSessionActivity,
  ChatMessage 
} from '@/utils/redis';
import { Logger } from '@/utils/logger';

const logger = new Logger("ChatAPI");

// Initialize services
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: env.OPENAI_API_KEY,
  modelName: 'text-embedding-3-small',
});
const qdrantClient = new QdrantClient({ 
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY 
});

// Request validation schema
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  sessionId: z.string().min(1, 'Session ID is required'),
});

// Response types
interface ChatResponse {
  message: string;
  sessionId: string;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request
    const body = await request.json();
    const { message, sessionId } = chatRequestSchema.parse(body);
    
    logger.info("Chat request received", { sessionId, messageLength: message.length });

    // Check if session exists, create if not
    let session = await getChatSession(sessionId);
    if (!session) {
      logger.info("Creating new chat session", { sessionId });
      session = await createChatSession(sessionId);
    } else {
      // Update session activity
      await updateSessionActivity(sessionId);
    }

    // Check rate limits
    const rateLimit = await checkRateLimit(sessionId);
    if (!rateLimit.allowed) {
      logger.warn("Rate limit exceeded", { sessionId, remaining: rateLimit.remaining });
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please wait before sending another message.',
          rateLimitInfo: {
            remaining: rateLimit.remaining,
            resetTime: rateLimit.resetTime
          }
        },
        { status: 429 }
      );
    }

    // Increment rate limit counters
    await incrementRateLimit(sessionId);

    // Store user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: Date.now()
    };
    await addMessageToSession(sessionId, userMessage);

    // Generate embedding for user message
    logger.info("Generating embedding for user message", { sessionId });
    const embedding = await embeddings.embedQuery(message);

    // Search Qdrant for relevant context
    logger.info("Searching Qdrant for relevant context", { sessionId });
    const searchResults = await qdrantClient.search(env.QDRANT_COLLECTION_NAME, {
      vector: embedding,
      limit: 5, // Get top 5 most relevant results
      with_payload: true,
      with_vector: false
    });

    // Extract context from search results
    const context = searchResults
      .map((result: any) => result.payload?.text)
      .filter(Boolean)
      .join('\n\n');

    logger.info("Context retrieved", { 
      sessionId, 
      contextLength: context.length,
      resultsCount: searchResults.length 
    });

    // Get conversation history for context
    const conversationHistory = await getChatSession(sessionId);
    const recentMessages = conversationHistory?.messages.slice(-10) || []; // Last 10 messages

    // Prepare system prompt with context
    const systemPrompt = `You are a helpful customer support assistant. Use the following context to answer the user's question accurately and helpfully:
    
    CONTEXT:
    ${context}

    IMPORTANT: 
    - If the context doesn't contain relevant information to answer the question, say so politely
    - Keep responses concise and helpful
    - Focus on providing accurate information based on the context provided
    - If you're unsure about something, acknowledge the limitation
    - Do not hallucinate or make up information`;

    // Prepare conversation for OpenAI
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...recentMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user' as const, content: message }
    ];

    // Generate response with OpenAI
    logger.info("Generating response with OpenAI", { sessionId });
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const assistantResponse = completion.choices[0]?.message?.content;
    if (!assistantResponse) {
      throw new Error('No response generated from OpenAI');
    }

    // Store assistant message
    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: assistantResponse,
      timestamp: Date.now()
    };
    await addMessageToSession(sessionId, assistantMessage);

    // Prepare response
    const response: ChatResponse = {
      message: assistantResponse,
      sessionId,
      rateLimitInfo: {
        remaining: rateLimit.remaining - 1,
        resetTime: rateLimit.resetTime
      }
    };

    logger.info("Chat response generated successfully", { 
      sessionId, 
      responseLength: assistantResponse.length 
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error("Error in chat API", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
