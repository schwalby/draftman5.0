# System Map — Actual Architecture (2026-06-12)

This corrects the stale CLAUDE.md "Architecture" section, which describes a deleted
13-phase manager bot (`QueueManager`, `MatchManager`, `DraftManager`, `ConfigManager`,
`WebhookSender`, `twelve_man_*` tables). **None of that exists in the live `bot/`.**

## Two deployables, one database

```
┌─────────────────────┐         ┌──────────────────────┐
│  Next.js web app     │         │  Discord bot          │
│  (src/, Railway)     │         │  (bot/, Railway/Docker)│
│                      │         │                       │
│  - pages (App Router)│         │  - slash commands     │
│  - ~40 API routes    │◄───────►│  - button/select flows│
│  - NextAuth (Discord)│  HTTP   │  - KTPBridge listener │
└──────────┬───────────┘ BOT_    └──────────┬────────────┘
           │             SECRET             │
           │  service-role key              │  service-role key
           ▼                                ▼
        ┌──────────────────────────────────────┐
        │      Supabase / PostgreSQL           │
        │  (also: realtime channels to clients)│
        └──────────────────────────────────────┘
```

Both processes also call `discord.com/api/v10` directly with the same `DISCORD_BOT_TOKEN`
(web does it via raw fetch from 3+ routes — see review §3.3).

## Web app (`src/`)

- **Auth:** NextAuth Discord OAuth, JWT strategy. Role flags (`is_organizer`,
  `is_superuser`, `is_captain`) read from `users` table into the JWT, re-checked every
  5 min (`src/lib/auth.ts`). `NEXT_PUBLIC_DEV_MODE` auto-grants organizer on login (§5.1 — remove!).
- **Data access:** `src/lib/supabase.ts` — anon client (client-side, realtime) +
  `getSupabaseAdmin()` (service role, all API routes). API routes use admin client even
  for unauthenticated GETs.
- **Key routes:**
  - `api/draft/[id]/picks` — draft picks (captain-gated; NO turn/status/signup validation yet)
  - `api/draft/[id]/lobby[/ready|/start]` — lobby flow; `start` flips event status to `drafting`
  - `api/tournaments/[id]/matches/[matchId]` — action-dispatch PATCH: `report` (BOT_SECRET),
    `simulate`, `confirm`, `reject`, `edit`; contains `recalcStandings` + `advanceBracket` helpers
  - `api/tournaments/[id]/seed-playoffs` — hardcoded 2-group A/B → 4 QF cross-seed
  - `api/verify/token|callback|grant|start|steam` — Steam OpenID verification chain
  - `api/events/[id]/signups` — web signup CRUD (accepts client priority — §1.2)
- **Realtime/sync (4 different patterns):** draft page = Supabase postgres_changes →
  full `fetchAll`; lobby = 3s polling; tournament page = realtime with **global**
  channel names; event page = per-event channel.
- **Monolith pages:** `events/[id]/draft/page.tsx` (62KB) and
  `events/[id]/tournament/page.tsx` (59KB) hold most draft/tournament business logic.

## Bot (`bot/`)

Flat structure — no managers:
- `index.ts` — interaction dispatcher (string-prefix routing on customIds) + MessageCreate
  listener for the results channel
- `commands/` — `signup` (+updaterole), `withdraw`, `checkin`, `draftday` (admin:
  checkin announce + team voice channels), `status`, `verify`
- `bridge/KTPBridge.ts` — parses score embeds from ANY bot in `RESULTS_CHANNEL_ID`,
  matches pending tournament matches by team-name substring, writes scores directly
  to DB (no winner_id, no audit) — see §3.1/§3.2
- `core/db.ts` — direct Supabase queries (service role). Note: `createSignup` computes
  priority by count+1 (race); `getVerifyToken` is a broken duplicate of the web flow (§1.3)
- Bot admin gating = Discord role **names** hardcoded in `draftday.ts` (web uses DB flags — §3.4)

## Database (key tables)

`users`, `events` (single flat `status` string drives all lifecycle), `signups`
(class[], priority, checked_in, status — soft-delete implied but bot hard-deletes),
`teams` (captain_id, pick_order), `draft_picks` (pick_number, picked_at), `draft_lobby`
(ready state), `tournament_groups`, `tournament_group_teams`, `tournament_matches`
(status, winner_id, next_match_id, scores incl. halves), `tournament_standings`
(stored, recalculated on confirm — lost-update prone), `tournament_match_edits`,
`verify_tokens` (written by TWO different flows with different columns), `audit_log`.

Schema lives only in production. `supabase/` contains two run-by-hand SQL worksheets.
No migrations system until R5.

## Event status lifecycle (informal, unenforced)

`draft` → `published` → `scheduled` → `lobby` → `drafting` → `active` → (complete?)
Transitions are free-form string updates; no server-side state machine. Bot treats
`['published','scheduled','active']` as "open"; signup-eligible = `['published','scheduled']`.

## Environment variables

Web: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_CLIENT_ID/SECRET`,
`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_VERIFIED_ROLE_ID`, `NEXTAUTH_SECRET/URL`,
`BOT_SECRET`, `STEAM_API_KEY`, `CAPTAINS_CHAT_CHANNEL_ID`, `CAPTAINS_ROLE_ID`,
`NEXT_PUBLIC_DEV_MODE` (**must be removed — §5.1**).
Bot: `DISCORD_BOT_TOKEN`, `BOT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`API_BASE_URL`, `RESULTS_CHANNEL_ID`, `QUEUE_CHANNEL_ID`, `DISCORD_CLIENT_ID`, `GUILD_ID`.
(Note `GUILD_ID` vs `DISCORD_GUILD_ID` — same value, two names.)
