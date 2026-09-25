import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-haiku-4.5";
const MAX_WORDS = 20;
const MAX_SENTENCES = 6;
const MAX_SENTENCE_LENGTH = 80;
const CALLS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

/** Records one call; throws if the classroom has used up this hour's budget. */
export const recordCall = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const recent = await ctx.db
      .query("aiCalls")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", now - HOUR_MS))
      .take(CALLS_PER_HOUR);
    if (recent.length >= CALLS_PER_HOUR) {
      throw new Error("Story Maker is resting. Please try again later.");
    }
    // Tidy up rows older than an hour so the table stays tiny.
    const old = await ctx.db
      .query("aiCalls")
      .withIndex("by_createdAt", (q) => q.lte("createdAt", now - HOUR_MS))
      .take(50);
    for (const row of old) await ctx.db.delete(row._id);

    await ctx.db.insert("aiCalls", { createdAt: now });
    return null;
  },
});

function cleanWords(raw: string[]): string[] {
  const words = Array.from(
    new Set(raw.map((w) => w.trim().toLowerCase()).filter(Boolean))
  );
  if (words.length < 1) throw new Error("Please choose some words");
  if (words.length > MAX_WORDS) throw new Error("Too many words");
  for (const w of words) {
    if (w.length > 20 || !/^[a-z][a-z' -]*$/.test(w)) {
      throw new Error("Invalid word");
    }
  }
  return words;
}

/**
 * Google's TTS refuses browser requests that carry a Referer (404), so the
 * pages can't play it directly. Fetch it here and return a data URI instead.
 */
async function ttsDataUri(text: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:audio/mpeg;base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function parseReply(text: string): { sentences: string[]; scene: string | null } {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  let list: unknown = null;
  let scene: unknown = null;
  try {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    list = parsed.sentences;
    scene = parsed.picture;
  } catch {
    // Fall back to one sentence per line.
    list = stripped.split(/\n+/);
  }
  const sentences = !Array.isArray(list)
    ? []
    : list
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.replace(/^[\s\-*\d.)]+/, "").trim())
        .filter((s) => s.length > 0 && s.length <= MAX_SENTENCE_LENGTH)
        .slice(0, MAX_SENTENCES);
  return {
    sentences,
    scene: typeof scene === "string" && scene.trim() ? scene.trim().slice(0, 300) : null,
  };
}

/**
 * Free Pollinations image (no key; the browser loads the URL directly).
 * The story model writes a concrete scene description to make up for the
 * free model's weaker prompt-following.
 */
function pictureUrl(scene: string): string {
  const prompt =
    `${scene}. Cute children's picture book illustration, simple flat 2D cartoon, ` +
    "bright colours, plain background, animals on four legs, no text.";
  const seed = Math.floor(Math.random() * 1_000_000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=576&seed=${seed}&safe=true`;
}

/**
 * Story Maker: public on purpose (pupils don't sign in), so input is
 * validated and calls are rate-limited via recordCall.
 */
export const generateStory = action({
  args: {
    words: v.array(v.string()),
    kind: v.union(v.literal("sentences"), v.literal("story")),
    level: v.optional(v.number()),
  },
  returns: v.object({
    sentences: v.array(v.string()),
    // One mp3 data URI per sentence (null if TTS failed; page falls back).
    audio: v.array(v.union(v.string(), v.null())),
    // Pollinations image URL for mini stories; null in sentences mode.
    picture: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const words = cleanWords(args.words);
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("Story Maker is not set up yet");

    await ctx.runMutation(internal.ai.recordCall, {});

    const task =
      args.kind === "story"
        ? [
            "Write ONE tiny story of 5 sentences, like a page from an early reader.",
            "It must be a real story, not a list of sentences:",
            "- one main character (an animal or a child with a short easy name like Ali, Mei or Sam) and one place, kept the same all the way through;",
            "- sentence 1 introduces the character and place, sentences 2-4 show something happening (a small problem or fun event), sentence 5 is a happy ending;",
            "- each sentence follows on from the one before, using he/she/it/they to refer back.",
            "Use the target words where they fit naturally; it is fine if a sentence has none.",
            'Example with words "big, run, one": "Sam has one little dog." "The dog sees a big ball." "It can run to the ball." "Sam and the dog play." "They are very happy."',
            'Also add "picture": a SIMPLE description (max 25 words) of one scene for an illustrator.',
            "At most two characters and one object, big in the middle, on a simple background. No names.",
            'Describe each by species, size and colour (e.g. "a small brown dog", "a boy in a red T-shirt") and one clear action.',
          ].join("\n")
        : "Write 4 separate example sentences. Each one should use at least one target word.";
    const system = [
      "You write reading practice for young Malaysian primary pupils (Year 1-3) who are weak in English.",
      "Rules: every sentence has at most 8 words.",
      "Apart from the target words, use only very common, easy words (cat, dog, mum, dad, big, red, run, sit...).",
      "Present tense. Friendly and child-safe.",
      args.kind === "story"
        ? 'Reply ONLY with JSON like {"sentences":["...","..."],"picture":"..."}.'
        : 'Reply ONLY with JSON like {"sentences":["...","..."]}.',
    ].join(" ");
    const user = `${task}\nTarget words: ${words.join(", ")}${
      args.level ? `\nLevel: ${args.level} (1 = easiest)` : ""
    }`;

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Remedial Monday",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0.9,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.error("OpenRouter error", res.status, await res.text());
      throw new Error("Story Maker could not answer. Please try again.");
    }
    const data = await res.json();
    const { sentences, scene } = parseReply(data?.choices?.[0]?.message?.content ?? "");
    if (sentences.length === 0) {
      throw new Error("Story Maker could not answer. Please try again.");
    }
    const audio = await Promise.all(sentences.map(ttsDataUri));
    const picture =
      args.kind === "story" ? pictureUrl(scene ?? sentences.join(" ")) : null;
    return { sentences, audio, picture };
  },
});
