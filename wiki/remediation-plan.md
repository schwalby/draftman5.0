# Remediation Plan — 2026-06-12

Incremental, behavior-preserving fixes for [architecture-review.md](architecture-review.md)
findings (§ refs). Status column tracks progress — update as items land.

**Sequencing rules:** (1) config/SQL before code; (2) DB constraints before route guards
(constraints turn races into 409s the UI already handles); (3) one duplicated workflow
consolidated per deploy.

## Phase 0 — Stop the bleeding (no deploys, ~1 hour)

| ID | What | Complexity | Status |
|---|---|---|---|
| R1 | Delete `NEXT_PUBLIC_DEV_MODE` from Railway; audit `SELECT discord_username,is_organizer,is_superuser FROM users WHERE is_organizer OR is_superuser;` revoke unintended (§5.1) | Low | ☑ 2026-06-12 — flag removed weeks prior by user; audit found 3 elevated accounts (1l.bb, gorillabc, tomfoolery1767), all confirmed intended; 85 users total |
| R2 | Run the check queries in `supabase/phase0_draft_picks_constraints.sql` against prod; apply the two ALTERs if clean (§2.1) | Low | ☑ 2026-06-12 — both unique constraints (`draft_picks_event_user_unique`, `draft_picks_event_pick_unique`) ALREADY present in prod. Nothing to apply. §2.1 picks-race closed at DB level |
| R3 | Dump prod schema → `supabase/schema.sql`, commit (migration zero). Also reveals verify_tokens columns → settles §1.3 exact breakage | Low | ☑ 2026-06-12 — `supabase/schema.sql` written (20 tables, 25KB) via pg_dump --schema-only. NOT yet git-committed. verify_tokens cols confirmed: id, discord_id, discord_username, token, used, expires_at, created_at (NO `user_id`/`expires` → confirms §1.3 bot path writes nothing usable) |

### R2b — Revoke anon/authenticated write grants (§5.6) — **NEW TOP PRIORITY** ☐
Discovered during R3. The single most severe live issue in the system: the public anon
key can write/delete/truncate any table directly via PostgREST, bypassing all API auth.
**☑ APPLIED 2026-06-12** via `supabase/migrations/001_revoke_anon_write_grants.sql`.
Verified live: anon PATCH/POST now return 401 (was 200); anon SELECT still 200 (reads/
realtime intact). Hole closed.

**Immediate safe fix** (app writes use service_role, which is unaffected; client only
SELECTs + realtime, which is SELECT-based):
```sql
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
```
Leaves SELECT intact (client reads/realtime keep working). Verify after: the anon PATCH
test must return 401/403/404, not 200. Complexity: Low. Blast radius: client-side direct
writes (there are none — grep confirmed all writes go through API routes/service_role).
**Follow-up (deferred, NOT now):** enable RLS + SELECT policies to also close anon's
read access to sensitive columns (verify_tokens, user flags). Bigger job — needs policies
written so client reads/realtime survive. Tracked as R2c.

### R2c — Enable RLS with SELECT policies (§5.6 read side) ☐ — deferred
After R2b stops writes, anon can still SELECT every column (verify_tokens, etc.). Enabling
RLS requires per-table SELECT policies so client reads + realtime keep working. Medium,
needs care. Trigger: do before exposing more sensitive columns; not blocking.

### R2d — Fix audit logging target (§5.7) ☑ 2026-06-12
Created `public.audit_log` matching the audit.ts insert shape via
`supabase/migrations/002_create_audit_log.sql` (text actor/target ids, no FKs, jsonb
metadata, service_role-only grants, indexes on created_at/action). Verified live:
service-role INSERT via PostgREST succeeds and reads back. logAudit() now records.
No app code change needed — audit.ts was already targeting `audit_log`.

R3 is a HARD prerequisite for Phases 1–2.

## Phase 1 — DB invariants (SQL-only)

| ID | What | Complexity | Status |
|---|---|---|---|
| R4 | Partial unique index on signups `(event_id, user_id) WHERE status != 'withdrawn'`. Clean duplicates first. Defer priority uniqueness until R8 | Low | ☑ 2026-06-12 — zero existing dupes; `signups_event_user_active_unique` applied via migration 003. One active signup per player/event now DB-enforced (race → 23505 → API can 409) |
| R5 | Migrations-going-forward: every schema change = numbered file in `supabase/migrations/` (§5.2) | Low (process) | ☑ 2026-06-12 — process adopted; `supabase/migrations/` now holds 001–003. schema.sql is migration-zero baseline. Going forward every DDL = next numbered file applied via psql |

## Phase 2 — State integrity in routes (highest-value code)

### R6 — Match lifecycle guards (Medium) — **most important code change** ☐
All in `api/tournaments/[id]/matches/[matchId]/route.ts`, response shapes unchanged:
1. `confirm`: add `.eq('status','awaiting_confirmation')` to update; 0 rows → 409 (kills double-confirm §2.2)
2. `advanceBracket`: deterministic slot from match_number parity (QF1→SF1.team1 etc.), not "first empty" → re-advance REPLACES
3. `reject`: clear rejected winner from next match's slot (un-advancement)
4. Refuse to confirm null-winner matches; derive winner from scores or error (closes §3.1 hole)
5. **(from growth analysis A2)** scope captain confirm rights to the match's own teams — global `isCaptain` lets any past captain confirm any match
Prereq: R3. Manually test full bracket on throwaway tournament before an event.
Blast radius: one file; behavior changes only in currently-buggy cases.

### R7 — Server-side draft validation (Medium) ☐
In `api/draft/[id]/picks/route.ts` POST:
1. event status must be `drafting`
2. drafted user must have non-withdrawn signup for this event
3. turn check: snake arithmetic server-side — COPY the client's exact computation
   (`draft/page.tsx:189-192`), don't reinvent; reject out-of-turn 409; **organizer bypass** preserves admin behavior
Prereq: R2. Risk: server/client snake divergence → lift client logic verbatim.

### R8 — Server-owned priority + capacity (Low) ☐
Web POST ignores body.priority → `max(priority)+1` (survives deletes, not count);
reject when confirmed signups ≥ capacity. Same in `bot/core/db.ts:createSignup`.
Grep UI for deliberate priority sends first. (§1.2) Prereq: R4.

### R9 — PATCH allowlist + checkin count (Low) ☐
- `users/[id]/route.ts`: replace `.update(body)` with explicit allowlist (mirror `events/[id]/route.ts:27-37` pattern) (§4.2)
- One-liner: checkin embed counts `checked_in=true`, not total signups (§5.5)
Bundle into any deploy.

## Phase 3 — Consolidate duplicates (one per deploy)

### R10 — Bot /verify → web token endpoint (Low) ☐
Delete `getVerifyToken` from `bot/core/db.ts`; `handleVerify` POSTs to
`/api/verify/token` with BOT_SECRET (both already in bot env). Pure deletion of the
broken duplicate (§1.3). Test once in Discord after deploy.

### R11 — KTPBridge containment (Medium) ☐
1. Only accept messages from `KTP_BOT_ID` env var (not any bot)
2. Whole-word team matches; require EXACTLY ONE candidate match, else log+skip
3. Skip matches that already have scores (idempotency)
4. Derive + write winner_id from scores (pairs with R6.4)
Prereq: capture 2–3 real KTP embeds for testing. Fails SAFE (skipped embed → manual
entry via report/edit path). NOT migrating to HTTP report path yet (deferred R19).

## Phase 4 — Maintainability

| ID | What | Complexity | Status |
|---|---|---|---|
| R12 | Rewrite CLAUDE.md architecture section to match reality; remove `bot-legacy/` from tree (git history preserves it) (§5.3) | Low | ☐ |
| R13 | Smoke-test script (plain tsx) vs scratch Supabase: full bracket flow + draft flow (in-turn, out-of-turn, double-pick). Run before events. Prereqs: R3+R5. Write alongside R6/R7 | Medium | ☐ |
| R14 | Replace empty `catch {}` with `console.warn('[context]', e)`; `/api/health` route; Railway alerts (§5.4) | Low | ☐ |

## Phase 5 — Deferred (trigger-based; do NOT pre-build)

| ID | What | Trigger |
|---|---|---|
| R15 | Centralize web→Discord calls, one helper + 429 retry (§3.3) | First rate-limit incident or 4th call site |
| R16 | Unique realtime channel names + debounced fetchAll (§6.1) — channel-name fix is one line/page, do anytime | First 50+ viewer event |
| R17 | Explicit event param on bot commands (§1.1) | First overlapping events on calendar |
| R18 | Unify bot/web authz (bot reads DB flags) (§3.4) | Next role restructure |
| R19 | KTPBridge → HTTP report path (§3.1) | Second score source appears |

**Explicitly out of scope:** rewriting the 62KB draft page, event-sourcing/outbox-as-
prerequisite, Postgres-functions-for-everything, service splits, framework migrations.

## Deploy cadence
Phases 0–1: one evening, no deploys. Phase 2: three independent deploys — R6 before
next tournament, R7 before next draft. Phases 3–4 ride along with feature work.
Velocity cost: ~one focused week total for R6+R7+R13.
