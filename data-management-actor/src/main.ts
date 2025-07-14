import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

import { OpenAIService } from './services/openai.service.js';
import { PineconeService } from './services/pinecone.service.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Initialize Services
const pineconeService = new PineconeService();
const openaiService = new OpenAIService();

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
            urls: links
                .map((link: { url: string | null; text: string }) => link.url)
                .filter((url: string | null): url is string => url !== null),
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
                    const allowedPatterns = ['/education/', '/support/', '/about/'];
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
                // Process content and generate embeddings
                const { text: processedText, embedding } = await openaiService.processAndEmbed(textContent);

                console.log('Generated embedding for:', _request.url);
                console.log('Embedding length:', embedding.length);

                // Store in Pinecone
                await pineconeService.storeContent(embedding, processedText, _request.url);
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
