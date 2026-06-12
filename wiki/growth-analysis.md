# Growth Analysis — Platform at 3× Complexity (2026-06-12)

Assumes remediation Phases 0–2 land first. Growth vectors cluster into three pressures:
**multiplicity** (simultaneous drafts, more tournament formats), **automation surface**
(Discord automation, admin workflows, integrations), **read load** (stats, reporting,
concurrency). Each pressure hits exactly one core assumption.

## Bottlenecks (B)

- **B1 — Implicit "one active event."** Fails first and hardest. `active[0]` in
  draftday, check-in-to-everything, global realtime channel names, single
  RESULTS_CHANNEL_ID, KTPBridge global scan — five expressions of one missing concept.
  Simultaneous drafts are impossible until event identity flows through every operation.
- **B2 — Refetch-everything sync.** Cost = viewers × events × write rate; all three grow.
  Two 50-viewer drafts → ~100 full refetches per pick. First *visible* growth failure.
- **B3 — Client monolith pages.** draft/page.tsx (62KB), tournament/page.tsx (59KB) are
  where the logic lives; every new feature lands there. Also degrades AI-assisted
  velocity (context limits) before runtime breaks.
- **B4 — Shared Discord identity, no traffic management.** Two processes, one token,
  zero 429 handling. Worst debuggability: intermittent, load-dependent, split logs.
- **B5 — Recalc-on-write derived data.** Every new stat built like recalcStandings is a
  new lost-update bug. Wrong stats are worse than no stats for a competitive community.

## Abstractions that break (A)

- **A1 — `events.status` flat string.** Parallel workflows (draft done, groups running,
  playoffs seeding) can't live in one linear status. Already creaking (draft_lobby table
  bolted alongside).
- **A2 — Global boolean roles.** Captaincy is per-event in reality (teams.captain_id) but
  `is_captain` is global — **live issue: any past captain can confirm any match in any
  tournament** (matches route :111). Folded into R6.5. Admin growth needs scoped roles.
- **A3 — Env vars as config.** Per-event channels, organizer self-serve, more bindings —
  env vars fail all three. Irony: legacy bot's ConfigManager did this in the DB; concept
  was deleted in the rewrite and growth forces its reinvention.
- **A4 — BOT_SECRET as universal machine credential.** More integrations = master key
  sprawl; no per-caller revocation or attribution.
- **A5 — Hand-duplicated types** (bot/core/types.ts vs src). Drift grows with every
  table; the scattered `as any` casts are this abstraction already failing.

## Fastest complexity compounders

1. **Dual bot+web signup/withdraw/checkin workflows** — every feature built twice, kept
   identical by hand; divergence already happened twice (priority semantics, delete
   semantics). One implementation must become a caller of the other.
2. **Route handlers as the business-logic layer** — auth+validation+writes+audit
   copy-pasted across ~40 routes; each new workflow clones the nearest route's bugs.
3. **Client-born rules needing later server enforcement** — everything gets built twice
   with a corruption window in between (R7 demonstrated the cost).

## Investments ranked by return (I)

| ID | Investment | Effort | When |
|---|---|---|---|
| I1 | **Generated DB types** (`supabase gen types typescript`, one generated file consumed by BOTH src/ and bot/) + migrations discipline | Low | NOW — de-risks everything below |
| I2 | **Extract the two engines**: `src/lib/draft-engine.ts`, `src/lib/tournament-engine.ts` — plain TS modules called by routes; pages hollow out toward renderers. Not services — FILES. R6/R7 logic done in a place built to grow | Medium, continuous | Always — a little every week; ~40% of structural effort |
| I3 | **Standings/stats as SQL views** — derived data computed, never stored by app code; deletes recalcStandings + its bug class. Foundation for all statistics features | Low-Med | The day someone asks for a stats page |
| I4 | **Explicit event identity** — event_id param on bot commands (smart default keeps current UX), per-event channel bindings, scoped realtime names, KTP bound per event | Medium | Before first calendar overlap, not after |
| I5 | **DB-backed config + per-event roles** — config table (global + per-event bindings), event_roles replacing misscoped booleans; organizers self-serve from existing settings UI | Medium | With I4 |
| I6 | **Discord outbox** — `discord_outbox` table: web inserts message intents, bot drains with 429 awareness, retry, sent/failed status. Consolidates Discord boundary into gateway owner; crash-survivable; queryable send log. A table + polling loop, not infrastructure | Medium | Before next automation expansion |
| I7 | **Structured logging + health checks** — `[component]` prefixes, health endpoints, Railway alerts | Low | Before automation expansion |

**NOT worth it at 3× scale:** microservices, message brokers (outbox table covers it),
GraphQL/tRPC, monorepo tooling, page rewrites (I2 hollows them out instead), caching
layers, multi-region.

## Allocation guide

| Share | Where | Trigger rule |
|---|---|---|
| ~40% | I2 engine extraction | Continuous, alongside features |
| ~20% | I4+I5 event identity & config | Day a second event hits the calendar |
| ~15% | I3 views | Day stats features begin |
| ~15% | I6+I7 outbox & observability | Day the next automation is added |
| ~10% | I1 types/migrations | Immediately |

**Unifying principle:** the review found every invariant in the wrong layer; the growth
strategy is moving each to its right layer before growth multiplies it — rules into
engines, derived data into the database, configuration into tables, Discord I/O into
the process that owns the gateway. Nothing here is a rewrite; everything ships while
Tuesday drafts keep running.
