/* eslint-disable import/no-extraneous-dependencies */
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';
import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import OpenAI from 'openai';

import { env } from './config/env.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: env.PINECONE_API_KEY,
});
const index = pinecone.index(env.PINECONE_INDEX_NAME);

// Retry logic with exponential backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: unknown) {
            const err = error as { status?: number };
            if (err?.status === 429 && i < maxRetries - 1) {
                const delay = 2 ** i * 1000; // Exponential backoff
                console.log(`Rate limited, waiting ${delay}ms before retry ${i + 1}/${maxRetries}`);
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, delay);
                });
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries exceeded');
}

// Function to store data in Pinecone with retry logic
async function storeInPinecone(embedding: number[], textContent: string, url: string) {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await index.upsert([
                {
                    id: `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    values: embedding,
                    metadata: { text: textContent, url, timestamp: new Date().toISOString() },
                },
            ]);
            console.log('✅ Successfully stored in Pinecone:', url);
            return;
        } catch (error: unknown) {
            if (attempt === maxRetries) {
                console.error('❌ Failed to store in Pinecone after all retries:', { url, error });
                throw error;
            }
            console.warn(`⚠️ Pinecone storage attempt ${attempt} failed, retrying...`, { url, error });
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000 * attempt);
            });
        }
    }
}

const crawler = new PlaywrightCrawler({
    async requestHandler({ request: _request, page, enqueueLinks, log }) {
        // Add timeout handling for page evaluation
        const pageData = await Promise.race([
            page.evaluate(() => {
                // Get all text content from the page (excluding links)
                const textElements = document.querySelectorAll(
                    'h1, h2, h3, h4, h5, h6, p, span, div, li, td, th, strong, em, b, i',
                );

                // Filter out navigation and ads
                const filteredElements = Array.from(textElements).filter((element) => {
                    // Skip if element is in navigation areas
                    if (element.closest('nav, .nav, .navigation, .menu, .header, .footer, .sidebar, .breadcrumb')) {
                        return false;
                    }
                    // Skip if element is likely an ad
                    if (element.closest('.ad, .advertisement, .banner, .promo, .sponsored, .ads')) {
                        return false;
                    }
                    // Skip if element is in utility areas
                    if (element.closest('.search, .login, .signup, .cookie-notice, .newsletter')) {
                        return false;
                    }
                    return true;
                });

                const textContent = filteredElements
                    .map((element) => element.textContent?.trim())
                    .filter((text) => text && text.length > 0)
                    .join('\n');

                // Get all links for enqueueing
                const links = Array.from(document.querySelectorAll('a[href]'))
                    .map((link) => ({
                        url: link.getAttribute('href'),
                        text: link.textContent?.trim() || '',
                    }))
                    .filter((link) => link.url && link.url.length > 0);

                return {
                    textContent,
                    links,
                };
            }),
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Page evaluation timeout after 30 seconds')), 30000);
            }),
        ]);

        const { textContent, links } = pageData;

        // Enqueue links for further scraping (Apify handles deduplication automatically)
        await enqueueLinks({
            urls: links.map((link: { url: string | null; text: string }) => link.url),
            label: 'detail',
            // Add domain and URL pattern filtering
            transformRequestFunction: (req) => {
                try {
                    const url = new URL(req.url);
                    const currentDomain = new URL(req.url).hostname;

                    // Domain filtering - only crawl same domain
                    if (currentDomain !== new URL(req.url).hostname) {
                        return false; // Don't follow external links
                    }

                    // URL pattern filtering - only crawl specific patterns
                    const allowedPatterns = ['/about/', '/education/', '/support/', '/about/'];
                    const hasAllowedPattern = allowedPatterns.some((pattern) => req.url.includes(pattern));

                    if (!hasAllowedPattern && !req.url.endsWith('/') && !req.url.endsWith('.html')) {
                        return false; // Skip non-relevant pages
                    }

                    // Normalize URLs to avoid duplicates
                    req.url = url.href;
                    return req;
                } catch (error) {
                    log.error(`Error processing URL: ${req.url}`, { error });
                    return false; // Skip invalid URLs
                }
            },
        });

        // Process text content with OpenAI for embedding
        if (textContent && textContent.length > 0) {
            try {
                const embeddings = new OpenAIEmbeddings({
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    modelName: 'text-embedding-3-small',
                });

                const openai = new OpenAI({
                    apiKey: process.env.OPENAI_API_KEY,
                });

                // Add preprocessing step with retry logic
                const processedContent = await retryWithBackoff(async () => {
                    return await openai.chat.completions.create({
                        model: 'gpt-3.5-turbo',
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

                // Then embed the processed content with retry logic
                const processedText = processedContent.choices[0].message.content;
                if (!processedText) {
                    throw new Error('No content returned from OpenAI preprocessing');
                }
                const embedding = await retryWithBackoff(async () => {
                    return await embeddings.embedQuery(processedText);
                });

                console.log('Generated embedding for:', _request.url);
                console.log('Embedding length:', embedding.length);

                // Store in Pinecone
                await storeInPinecone(embedding, processedText, _request.url);
            } catch (error) {
                log.error('Error processing page', {
                    url: _request.url,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    timestamp: new Date().toISOString(),
                    contentLength: textContent?.length || 0,
                });
            }
        }
    },
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    try {
        crawler.stop();
        console.log('✅ Crawler stopped successfully');
    } catch (error) {
        console.error('❌ Error stopping crawler:', error);
    }
    await Actor.exit();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    try {
        crawler.stop();
        console.log('✅ Crawler stopped successfully');
    } catch (error) {
        console.error('❌ Error stopping crawler:', error);
    }
    await Actor.exit();
    process.exit(0);
});

await crawler.run();

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();
