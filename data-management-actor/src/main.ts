// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

// this is ESM project, and as such, it requires you to specify extensions in your relative imports
// read more about this here: https://nodejs.org/docs/latest-v18.x/api/esm.html#mandatory-file-extensions
// note that we need to use `.js` even when inside TS files
// import { router } from './routes.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, enqueueLinks, pushData, log }) {
        const pageData = await page.evaluate(() => {
            // Get all text content from the page (excluding links)
            const textElements = document.querySelectorAll(
                'h1, h2, h3, h4, h5, h6, p, span, div, li, td, th, strong, em, b, i',
            );
            const textContent = Array.from(textElements)
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
            // Optional: Add custom deduplication
            transformRequestFunction: (request) => {
                // Normalize URLs to avoid duplicates with different formats
                const normalizedUrl = new URL(request.url).href;
                request.url = normalizedUrl;
                return request;
            },
        });
    },
});

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();
