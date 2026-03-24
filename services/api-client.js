const settings = require('../settings.json');

const BASE_DELAY = settings.api.base_delay_ms;
let currentDelay = BASE_DELAY;
let rateLimitResetTime = 0;

const delay = ms => new Promise(res => setTimeout(res, ms));

async function smartFetch(url, headers, retries = 3) {
    const now = Date.now();
    if (now < rateLimitResetTime) {
        const waitTime = rateLimitResetTime - now;
        console.log(`      ⏳ Aguardando cooldown global (${Math.ceil(waitTime / 1000)}s)...`);
        await delay(waitTime);
    }

    const start = Date.now();
    let response = null;
    let error = null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
        response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);

        if ((response.status === 429 || response.status === 403 || response.status >= 500) && retries > 0) {
            const penaltyMultiplier = 1.15 + (Math.random() * 0.15);
            currentDelay = Math.min(Math.floor(currentDelay * penaltyMultiplier), 30000);

            let resetInSeconds = parseInt(response.headers.get('x-ratelimit-reset')) || 30;
            resetInSeconds = Math.max(resetInSeconds, 15);

            const jitterMs = Math.floor(Math.random() * 4000) + 1000;
            const totalWaitMs = (resetInSeconds * 1000) + jitterMs;

            console.log(`      ⛔ Block API (${response.status})! Radar lento: ${currentDelay}ms/req. Evadindo radiação por ${Math.ceil(totalWaitMs / 1000)}s...`);

            rateLimitResetTime = Date.now() + totalWaitMs;
            await delay(totalWaitMs);

            return await smartFetch(url, headers, retries - 1);
        }
    } catch (e) {
        clearTimeout(timeoutId);
        error = e;
    }

    const elapsed = Date.now() - start;
    const remainingDelay = Math.max(0, currentDelay - elapsed);
    if (remainingDelay > 0) {
        const postCallJitter = Math.floor(Math.random() * 300);
        await delay(remainingDelay + postCallJitter);
    }

    if (error) throw error;
    return response;
}

module.exports = { smartFetch };
