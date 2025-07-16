import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

import { OpenAIService } from './services/openai.service.js';
import { PineconeService } from './services/pinecone.service.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Initialize Services
console.log('✅ Initializing services...');
const pineconeService = new PineconeService();
const openaiService = new OpenAIService();
console.log('✅ Services initialized successfully');


const crawler = new PlaywrightCrawler({
    async requestHandler({ request: _request, page, enqueueLinks, log }) {
        // Handle the "Continue Here" dialog if it appears
        try {
            await page.waitForSelector('text=Yes, Continue Here', { timeout: 5000 });
            await page.click('text=Yes, Continue Here');
            console.log('✅ Handled continue dialog');
        } catch (error) {
            // Dialog didn't appear, continue normally
            console.log('ℹ️ No dialog found, continuing...');
        }

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
                console.log('🔍 Getting all links...');
                const links = Array.from(document.querySelectorAll('a[href]'))
                    .map((link) => ({
                        url: link.getAttribute('href'),
                        text: link.textContent?.trim() || '',
                    }))
                    .filter((link) => link.url && link.url.length > 0);
                console.log('🔍 Found links:', links);
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
                    const currentDomain = url.hostname;

                    // Domain filtering - only crawl same domain
                    if (currentDomain !== 'www.aven.com') {
                        return false; // Don't follow external links
                    }

                    // Allow homepage to be crawled
                    const isHomepage = req.url === 'https://www.aven.com/' || req.url === 'https://www.aven.com';
                    
                    // URL pattern filtering - only crawl specific patterns
                    const allowedPatterns = ['/about', '/education', '/support'];
                    const hasAllowedPattern = allowedPatterns.some((pattern) => req.url.includes(pattern));

                    if (!isHomepage && !hasAllowedPattern) {
                        return false; // Skip non-relevant pages
                    }

                    // Normalize URLs to avoid duplicates
                    console.log('💥 Normalizing URL:', url.href);
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
                console.log('🔍 Processing text content...');
                // Process content and generate embeddings
                // const { text: processedText, embedding } = await openaiService.processAndEmbed(textContent);
                // console.log('🔍 Generated embedding for:', _request.url);
                // console.log('Generated embedding for:', _request.url);
                // console.log('Embedding length:', embedding.length);

                // // Store in Pinecone
                // await pineconeService.storeContent(embedding, processedText, _request.url);
                // console.log('🔍 Stored content in Pinecone');
                console.log('🔍 Processing text content...', textContent.length);
                
                // Save to text file instead of Pinecone
                const fs = await import('fs/promises');
                const path = await import('path');
                
                // Create filename from URL
                const urlObj = new URL(_request.url);
                const filename = urlObj.pathname.replace(/\//g, '_') || 'homepage';
                const filepath = path.join(process.cwd(), 'scraped_content', `${filename}.txt`);
                
                // Ensure directory exists
                await fs.mkdir(path.dirname(filepath), { recursive: true });
                
                // Save content to file in URL: text format
                const content = `URL: ${_request.url}\nTEXT: ${textContent}`;
                await fs.writeFile(filepath, content, 'utf8');
                console.log('✅ Content saved to file:', filepath);
                
            } catch (error) {
                log.error('Error processing page', {
                    url: _request.url,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    timestamp: new Date().toISOString(),
                    contentLength: textContent?.length || 0,
                });
                console.error('❌ Error processing page:', _request.url);
            }
        }
        // Close page after processing
        await page.close();
        console.log('✅ Page closed');
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

await crawler.run(['https://www.aven.com/']);

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();
