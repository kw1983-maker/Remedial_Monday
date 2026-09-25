/**
 * Story Maker client: asks the Convex action ai:generateStory for simple
 * sentences. The OpenRouter key lives only in Convex (OPENROUTER_API_KEY).
 * Load after convex-url.js with <script type="module" src="ai-client.js">.
 */
import { ConvexHttpClient } from "https://esm.sh/convex@1.25.4/browser";
import { anyApi } from "https://esm.sh/convex@1.25.4/server";

const url = (typeof window.CONVEX_URL === "string" && window.CONVEX_URL.trim())
    ? window.CONVEX_URL.trim()
    : "http://127.0.0.1:3210";

const client = new ConvexHttpClient(url);

window.StoryAI = {
    ready: true,
    async generate(words, kind, level) {
        // -> { sentences: string[], audio: (mp3 data URI | null)[] }
        return await client.action(anyApi.ai.generateStory, {
            words,
            kind,
            level: level || undefined,
        });
    },
};
window.dispatchEvent(new Event("storyAIReady"));
