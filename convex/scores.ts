import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const MAX_NAME_LENGTH = 40;
const LEADERBOARD_LIMIT = 10;

function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

/**
 * Classroom leaderboard: public on purpose so pupils can submit
 * scores from the static HTML game without signing in.
 */
export const submit = mutation({
  args: {
    pupilName: v.string(),
    score: v.number(),
    game: v.string(),
    wordSet: v.optional(v.string()),
  },
  returns: v.object({
    _id: v.id("scores"),
    isNewBest: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const pupilName = cleanName(args.pupilName);
    if (pupilName.length < 1) {
      throw new Error("Please enter your name");
    }
    if (!Number.isFinite(args.score) || args.score < 0) {
      throw new Error("Invalid score");
    }
    if (args.score > 1_000_000) {
      throw new Error("Score too high");
    }
    const game = args.game.trim().slice(0, 40);
    if (!game) {
      throw new Error("Invalid game");
    }

    const previousBest = await ctx.db
      .query("scores")
      .withIndex("by_game_and_name", (q) =>
        q.eq("game", game).eq("pupilName", pupilName)
      )
      .collect();

    const bestSoFar = previousBest.reduce(
      (max, row) => Math.max(max, row.score),
      0
    );
    const isNewBest = args.score > bestSoFar;

    const id = await ctx.db.insert("scores", {
      pupilName,
      score: Math.floor(args.score),
      game,
      wordSet: args.wordSet?.trim().slice(0, 40),
      createdAt: Date.now(),
    });

    return { _id: id, isNewBest };
  },
});

export const leaderboard = query({
  args: {
    game: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      pupilName: v.string(),
      score: v.number(),
      wordSet: v.optional(v.string()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(
      Math.max(args.limit ?? LEADERBOARD_LIMIT, 1),
      50
    );
    const game = args.game.trim();
    if (!game) return [];

    const rows = await ctx.db
      .query("scores")
      .withIndex("by_game_and_score", (q) => q.eq("game", game))
      .order("desc")
      .take(200);

    // Keep each pupil's best score only
    const bestByName = new Map<
      string,
      {
        pupilName: string;
        score: number;
        wordSet?: string;
        createdAt: number;
      }
    >();

    for (const row of rows) {
      const existing = bestByName.get(row.pupilName.toLowerCase());
      if (!existing || row.score > existing.score) {
        bestByName.set(row.pupilName.toLowerCase(), {
          pupilName: row.pupilName,
          score: row.score,
          wordSet: row.wordSet,
          createdAt: row.createdAt,
        });
      }
    }

    return Array.from(bestByName.values())
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

/** CLI-only cleanup: npx convex run scores:removeByNames '{"game":"word-shooter","names":["Danial","Aina"]}' */
export const removeByNames = internalMutation({
  args: {
    game: v.string(),
    names: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const targets = new Set(
      args.names.map((n) => cleanName(n).toLowerCase()).filter(Boolean)
    );
    if (targets.size === 0) return 0;

    const rows = await ctx.db
      .query("scores")
      .withIndex("by_game_and_score", (q) => q.eq("game", args.game.trim()))
      .order("desc")
      .take(500);

    let removed = 0;
    for (const row of rows) {
      if (targets.has(row.pupilName.toLowerCase())) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }
    return removed;
  },
});
