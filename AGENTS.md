# remedial-monday

Classroom teaching materials: self-contained static HTML activities plus a small
Convex backend that powers the "Word Shooter" leaderboard.

- Static games/apps (open directly or serve statically):
  - `level1-sight-words-remedial.html`, `level2-word-workshop-remedial.html` — teaching apps (large, embedded audio).
  - `word-shooter.html`, `word-shooter-level2.html` — arcade games with a Convex leaderboard.
- `convex/` — Convex backend (`scores.ts`: `submit`, `leaderboard`, and internal `removeByNames`; schema in `schema.ts`).
- `convex-url.js` — sets `window.CONVEX_URL` for the games; points at the **production** cloud deployment.
- `attendance-apps-script.gs` — Google Apps Script; not part of local dev.
- Production hosting is Vercel (`vercel.json` rewrites `/` → level1, `/level2` → level2).

## Cursor Cloud specific instructions

- Dependencies: `npm install` (the only dependency is `convex`). This is the startup update script.
- Backend (Convex) dev server: run `CONVEX_AGENT_MODE=anonymous npx convex dev`. The
  `CONVEX_AGENT_MODE=anonymous` prefix is **required** in this environment — without it the
  CLI tries to open a browser login and hangs. It downloads a local backend binary, serves at
  `http://127.0.0.1:3210`, and writes an anonymous `.env.local` (gitignored). Use `--once` for a
  one-shot push (does codegen + typecheck + deploy) instead of a long-running watcher.
- There is no standalone lint/tsc step (TypeScript is not a dependency). Convex functions are
  typechecked automatically as part of `convex dev` / `convex dev --once`; a clean push means the
  backend typechecks.
- Exercise backend functions directly, e.g.
  `CONVEX_AGENT_MODE=anonymous npx convex run scores:submit '{"pupilName":"X","score":100,"game":"word-shooter"}'`
  and `... npx convex run scores:leaderboard '{"game":"word-shooter"}'`.
- Static games: serve the repo root with any static server (e.g. `python3 -m http.server 8000`)
  and open `http://127.0.0.1:8000/word-shooter.html`. The games are plain HTML/JS and load the
  Convex browser client from `esm.sh` (needs network egress).
- Leaderboard gotcha: `convex-url.js` hardcodes the **production** cloud Convex URL, so playing a
  Word Shooter game against the committed file writes to the real classroom leaderboard. To test
  the leaderboard against your local backend, temporarily set
  `window.CONVEX_URL = "http://127.0.0.1:3210"` in `convex-url.js` and revert before committing.
