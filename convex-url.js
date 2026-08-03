/**
 * Convex deployment URL for the Word Shooter leaderboard.
 *
 * Local anonymous backend (default while developing):
 *   http://127.0.0.1:3210
 *
 * For the live Vercel site, link a Cloud Convex project then replace this URL:
 *   1. In a terminal:  npx convex login
 *   2.              npx convex dev   (choose / create your team project)
 *   3. Copy CONVEX_URL from .env.local into CONVEX_URL below
 *   4. Optional production backend: npx convex deploy
 */
window.CONVEX_URL = "http://127.0.0.1:3210";
