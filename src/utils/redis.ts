import { createClient } from "redis";
import { env } from "../config/env";
import { Logger } from "./logger";

const logger = new Logger("Redis");

let redisClient: ReturnType<typeof createClient> | null = null;

// Constants for chat session management
const SESSION_TTL = 30 * 60; // 15 minutes in seconds
const MESSAGE_TTL = 60 * 60; // 1 hour for message history
const RATE_LIMIT_WINDOW = 60; // 1 minute window for rate limiting
const MAX_MESSAGES_PER_MINUTE = 5;
const MAX_MESSAGES_PER_SESSION = 30;

// Types for chat session management
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  messages: ChatMessage[];
}

export async function getRedisClient() {
  if (!redisClient) {
    logger.info("Creating new Redis client connection");
    redisClient = createClient({
      url: env.REDIS_URL,
    });

    try {
      await redisClient.connect();
      logger.info("Redis client connected successfully");
    } catch (error) {
      logger.error("Failed to connect to Redis", error);
      throw error;
    }
  }

  return redisClient;
}

// Chat Session Management Functions
export async function createChatSession(sessionId: string): Promise<ChatSession> {
  try {
    const client = await getRedisClient();
    const sessionKey = `chat_session:${sessionId}`;
    const rateLimitKey = `rate_limit:${sessionId}`;
    const messageCountKey = `message_count:${sessionId}`;
    
    const now = Date.now();
    const session: ChatSession = {
      sessionId,
      createdAt: now,
      lastActivity: now,
      messageCount: 0,
      messages: []
    };

    // Store session with TTL
    await client.setEx(sessionKey, SESSION_TTL, JSON.stringify(session));
    
    // Initialize rate limiting counters
    await client.setEx(rateLimitKey, RATE_LIMIT_WINDOW, '0');
    await client.setEx(messageCountKey, SESSION_TTL, '0');

    logger.info("Chat session created successfully", { sessionId });
    return session;
  } catch (error) {
    logger.error("Failed to create chat session", error, { sessionId });
    throw error;
  }
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  try {
    const client = await getRedisClient();
    const sessionKey = `chat_session:${sessionId}`;
    
    const sessionData = await client.get(sessionKey);
    
    if (sessionData) {
      const session: ChatSession = JSON.parse(sessionData);
      logger.info("Chat session retrieved successfully", { sessionId });
      return session;
    } else {
      logger.warn("Chat session not found", { sessionId });
      return null;
    }
  } catch (error) {
    logger.error("Failed to retrieve chat session", error, { sessionId });
    throw error;
  }
}

export async function addMessageToSession(sessionId: string, message: ChatMessage): Promise<void> {
  try {
    const client = await getRedisClient();
    const sessionKey = `chat_session:${sessionId}`;
    const messageKey = `messages:${sessionId}`;
    
    // Get current session
    const sessionData = await client.get(sessionKey);
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const session: ChatSession = JSON.parse(sessionData);
    
    // Add message to session
    session.messages.push(message);
    session.messageCount = session.messages.length;
    session.lastActivity = Date.now();
    
    // Update session with new TTL
    await client.setEx(sessionKey, SESSION_TTL, JSON.stringify(session));
    
    // Store message separately with longer TTL for history
    await client.setEx(
      `${messageKey}:${message.id}`, 
      MESSAGE_TTL, 
      JSON.stringify(message)
    );
    
    logger.info("Message added to session successfully", { 
      sessionId, 
      messageId: message.id,
      messageCount: session.messageCount 
    });
  } catch (error) {
    logger.error("Failed to add message to session", error, { sessionId });
    throw error;
  }
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    const session = await getChatSession(sessionId);
    return session?.messages || [];
  } catch (error) {
    logger.error("Failed to get session messages", error, { sessionId });
    throw error;
  }
}

// Rate Limiting Functions
export async function checkRateLimit(sessionId: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  try {
    const client = await getRedisClient();
    const rateLimitKey = `rate_limit:${sessionId}`;
    const messageCountKey = `message_count:${sessionId}`;
    
    // Check per-minute rate limit
    const currentMinuteCount = await client.get(rateLimitKey);
    const minuteCount = currentMinuteCount ? parseInt(currentMinuteCount) : 0;
    
    // Check session total limit
    const sessionCount = await client.get(messageCountKey);
    const totalCount = sessionCount ? parseInt(sessionCount) : 0;
    
    const allowed = minuteCount < MAX_MESSAGES_PER_MINUTE && totalCount < MAX_MESSAGES_PER_SESSION;
    const remaining = Math.min(
      MAX_MESSAGES_PER_MINUTE - minuteCount,
      MAX_MESSAGES_PER_SESSION - totalCount
    );
    
    // Get TTL for reset time
    const ttl = await client.ttl(rateLimitKey);
    const resetTime = Date.now() + (ttl * 1000);
    
    logger.info("Rate limit check completed", { 
      sessionId, 
      allowed, 
      remaining, 
      minuteCount, 
      totalCount 
    });
    
    return { allowed, remaining, resetTime };
  } catch (error) {
    logger.error("Failed to check rate limit", error, { sessionId });
    throw error;
  }
}

export async function incrementRateLimit(sessionId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    const rateLimitKey = `rate_limit:${sessionId}`;
    const messageCountKey = `message_count:${sessionId}`;
    
    // Increment per-minute counter
    await client.incr(rateLimitKey);
    
    // Increment session total counter
    await client.incr(messageCountKey);
    
    logger.info("Rate limit counters incremented", { sessionId });
  } catch (error) {
    logger.error("Failed to increment rate limit", error, { sessionId });
    throw error;
  }
}

// Session Management Functions
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    const sessionKey = `chat_session:${sessionId}`;
    
    const sessionData = await client.get(sessionKey);
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    const session: ChatSession = JSON.parse(sessionData);
    session.lastActivity = Date.now();
    
    // Update session with new TTL
    await client.setEx(sessionKey, SESSION_TTL, JSON.stringify(session));
    
    logger.info("Session activity updated", { sessionId });
  } catch (error) {
    logger.error("Failed to update session activity", error, { sessionId });
    throw error;
  }
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    const sessionKey = `chat_session:${sessionId}`;
    const rateLimitKey = `rate_limit:${sessionId}`;
    const messageCountKey = `message_count:${sessionId}`;
    const messagePattern = `messages:${sessionId}:*`;
    
    // Delete session and related keys
    await client.del([sessionKey, rateLimitKey, messageCountKey]);
    
    // Delete all messages for this session
    const messageKeys = await client.keys(messagePattern);
    if (messageKeys.length > 0) {
      await client.del(messageKeys);
    }
    
    logger.info("Chat session deleted successfully", { sessionId });
  } catch (error) {
    logger.error("Failed to delete chat session", error, { sessionId });
    throw error;
  }
}

export async function cleanupExpiredSessions(): Promise<number> {
  try {
    const client = await getRedisClient();
    
    // Get all session keys
    const sessionKeys = await client.keys('chat_session:*');
    let cleanedCount = 0;
    
    for (const key of sessionKeys) {
      const ttl = await client.ttl(key);
      if (ttl <= 0) {
        const sessionId = key.replace('chat_session:', '');
        await deleteChatSession(sessionId);
        cleanedCount++;
      }
    }
    
    logger.info("Expired sessions cleanup completed", { cleanedCount });
    return cleanedCount;
  } catch (error) {
    logger.error("Failed to cleanup expired sessions", error);
    throw error;
  }
}
