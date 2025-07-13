/* eslint-disable import/no-extraneous-dependencies */
import { OpenAIEmbeddings } from '@langchain/openai';
import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import OpenAI from 'openai';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

const crawler = new PlaywrightCrawler({
    async requestHandler({ request: _request, page, enqueueLinks, log }) {
        const pageData = await page.evaluate(() => {
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
        });

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

                // Add preprocessing step
                const processedContent = await openai.chat.completions.create({
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

                // Then embed the processed content
                const processedText = processedContent.choices[0].message.content;
                if (!processedText) {
                    throw new Error('No content returned from OpenAI preprocessing');
                }
                const embedding = await embeddings.embedQuery(processedText);

                console.log('Generated embedding for:', _request.url);
                console.log('Embedding length:', embedding.length);

                // TODO: Add Pinecone storage here
                // await storeInPinecone(embedding, textContent, _request.url);
            } catch (error) {
                log.error('Error generating embedding:', { error });
            }
        }
    },
});

await crawler.run();

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();
