/**
 * Retry logic with exponential backoff
 * Handles rate limiting (429 errors) and temporary failures
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
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
