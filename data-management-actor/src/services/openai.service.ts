/* eslint-disable import/no-extraneous-dependencies */
import { OpenAIEmbeddings } from '@langchain/openai';
import OpenAI from 'openai';

import { env } from '../config/env.js';
import { retryWithBackoff } from '../utils/retry.utils.js';

export class OpenAIService {
    private openai: OpenAI;
    private embeddings: OpenAIEmbeddings;

    constructor() {
        this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: env.OPENAI_API_KEY,
            modelName: 'text-embedding-3-small',
        });
    }

    /**
     * Preprocess content using OpenAI to extract relevant information
     */
    async preprocessContent(textContent: string): Promise<string> {
        const processedContent = await retryWithBackoff(async () => {
            return await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo', // may update this to use an array of models
                messages: [
                    {
                        role: 'system',
                        content:
                            'Extract and structure the main customer-relevant content. Remove any remaining navigation, ads, or boilerplate. Focus on information that would help answer customer questions.',
                    },
                    {
                        role: 'user',
                        content: textContent,
                    },
                ],
            });
        });

        const processedText = processedContent.choices[0].message.content;
        if (!processedText) {
            throw new Error('No content returned from OpenAI preprocessing');
        }
        return processedText;
    }

    /**
     * Generate embeddings for processed text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        return await retryWithBackoff(async () => {
            return await this.embeddings.embedQuery(text);
        });
    }

    /**
     * Process content and generate embeddings in one step
     */
    async processAndEmbed(textContent: string): Promise<{ text: string; embedding: number[] }> {
        const processedText = await this.preprocessContent(textContent);
        const embedding = await this.generateEmbedding(processedText);

        return {
            text: processedText,
            embedding,
        };
    }
}
