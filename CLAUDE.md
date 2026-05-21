# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview



**dodtourneys** (DRAFT MAN 5.0) is a community platform for the Day of Defeat 1.3 scene — managing event sign-ups, team drafts, and match tournaments. It has two independently deployable pieces: a Next.js web app and a Discord bot, both sharing the same Supabase database.

Deployed at: https://draftman50-production.up.railway.app  
Git remote: https://github.com/schwalby/draftman5.0.git

## Engineering Priorities

This project is a real-time stateful event system, not a simple Discord bot.

Primary priorities:

1. Preserve runtime stability
2. Prevent state corruption
3. Minimize async hazards
4. Reduce architectural complexity
5. Improve maintainability incrementally
6. Preserve existing interaction behavior unless explicitly instructed otherwise

Favor:

* incremental migration
* explicit ownership boundaries
* isolated side effects
* predictable behavior
* readability over clever abstractions

Avoid:

* wholesale rewrites
* speculative redesigns
* unnecessary abstractions
* “best practice” rewrites without operational justification

## Async and Timer Safety

This system is heavily asynchronous and timer-driven.

Changes involving:

* timers
* intervals
* Discord interactions
* queue lifecycle
* voting lifecycle
* draft lifecycle
* voice movement
* persistence synchronization

must be treated as HIGH RISK.

Always analyze:

* race conditions
* stale state risks
* orphaned timers
* duplicate execution
* event ordering assumptions
* cleanup guarantees
* concurrent state mutation

Never casually refactor timer-driven workflows.

## Refactor Rules

Do NOT:

* rewrite large systems wholesale
* redesign unrelated systems during refactors
* combine architecture rewrites with feature development
* silently change runtime behavior
* introduce broad abstractions prematurely

Preferred workflow:

1. Analyze
2. Identify risks
3. Propose migration strategy
4. Extract modules
5. Preserve behavior
6. Refactor incrementally
7. Review for regressions

Prefer controlled migration over replacement.


## Architectural Review Expectations

When reviewing code, act as a hostile senior backend engineer performing an architectural audit.

Aggressively identify:

* race conditions
* stale state risks
* orphaned timers
* async hazards
* hidden coupling
* memory leaks
* operational fragility
* duplicated workflows
* unclear ownership boundaries
* Discord API abuse risks
* crash recovery weaknesses

Be extremely critical of:

* shared mutable state
* timer lifecycle management
* event ordering assumptions
* side effect management
* implicit coupling




---

## Commands

### Web App (project root)
```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run production build
```

### Discord Bot (`/bot`)
```bash
cd bot
npm run dev      # ts-node index.ts (dev, no compile step)
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

There are no test scripts configured in either `package.json`.

---

## Architecture

### Two-App Structure

The web app (`src/`) and bot (`bot/`) are separate TypeScript projects with separate `package.json` and `tsconfig.json`. The root `tsconfig.json` explicitly excludes `bot/`. They share a Supabase database but have **no direct code imports** between them — communication is through the database and HTTP calls from the bot to the web API.

### Web App — Next.js App Router

- **`src/app/`** — All pages and API routes. Page routes use server components; API routes are route handlers.
- **`src/lib/`** — Shared utilities: `auth.ts` (NextAuth config + role callbacks), `supabase.ts` (exports both anon client and admin client), `steam.ts` (SteamID conversion), `audit.ts` (logging wrapper).
- **`src/components/`** — Client components only; all data fetching happens in page-level server components or API routes.
- **`@/*`** path alias maps to `src/`.

Authentication is Discord OAuth via NextAuth (JWT strategy). The JWT callback attaches `isOrganizer`, `isSuperUser`, and `isCaptain` flags from the `users` table. These propagate to `session.user` and are used for authorization checks in API routes.

### Discord Bot — Phase-Based Architecture

The bot was refactored in 13 phases into distinct managers. The match lifecycle flows:

```
QueueManager → MatchManager → vote managers (captain/map/server) → DraftManager → ResultManager
```

Key singletons: `core/client.ts` (discord.js Client), `core/supabase.ts` (Supabase admin client), `config/ConfigManager.ts` (persists bot settings to DB).

`KTPBridge` listens for embeds from an external score bot in the results channel and triggers winner voting. `WebhookSender` edits live Discord messages during vote phases.

### Database (Supabase / PostgreSQL)

Two client tiers: anon key (used in Next.js client-side code) and service role key (used in API routes and bot). Never use the service role key in client-side code.

Key tables: `users`, `events`, `signups`, `teams`, `draft_picks`, `tournament_groups`, `tournament_standings`, `audit_log` (web); `twelve_man_config`, `twelve_man_queue`, `twelve_man_captain_cooldowns`, `twelve_man_match_counter` (bot).

---

## Environment Variables

### Web (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_BOT_TOKEN          # Used to make bot API calls from web
DISCORD_REDIRECT_URI
NEXTAUTH_SECRET
NEXTAUTH_URL
NEXT_PUBLIC_DEV_MODE       # If set, first authenticated user is auto-promoted to organizer
```

### Bot (`bot/.env`)
```
DISCORD_BOT_TOKEN
BOT_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
API_BASE_URL               # Web app base URL for HTTP calls
RESULTS_CHANNEL_ID
QUEUE_CHANNEL_ID
```

---

## Deployment

Both services deploy to Railway. The bot runs in Docker (Alpine, `bot/Dockerfile`). Next.js config (`next.config.mjs`) whitelists `cdn.discordapp.com` and `steamstatic.com` for Next.js Image optimization.
