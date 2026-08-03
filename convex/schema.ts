import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  scores: defineTable({
    pupilName: v.string(),
    score: v.number(),
    game: v.string(),
    wordSet: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_game_and_score", ["game", "score"])
    .index("by_game_and_name", ["game", "pupilName"]),
});
