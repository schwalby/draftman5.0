# Architectural Review — 2026-06-12

Hostile audit of the live system (`bot/` + `src/`; `bot-legacy/` excluded as deprecated).
Severity: Critical / High / Medium / Low. File:line refs verified against the codebase
on the review date.

**Overall verdict:** a CRUD app wearing a distributed system's clothes. The hard
problems — concurrency, atomicity, state ownership, ingestion trust — are pushed to
DB defaults (which don't enforce them) or to the client (which can't). Every invariant
lives in the wrong layer. Correctness is currently a property of small size and good
behavior, not architecture.

---

## 1. State ownership

### §1.1 No component owns "the active event" — CRITICAL
Bot resolves active event as first open event by start time (`bot/commands/draftday.ts:27-36`).
`/checkin` checks user into EVERY open window, reports stats for `eligible[0]`
(`bot/commands/checkin.ts:46-50`). Web has no active-event concept.
**Failure:** two overlapping events → wrong channels created, players silently
checked into both, wrong counts announced.
**Impact:** every multi-event future feature requires retrofitting event identity.

### §1.2 `signups` has three writers with three invariants — HIGH
- Bot: `priority = count + 1` read-then-write (`bot/core/db.ts:56-70`)
- Web: accepts CLIENT-SUPPLIED priority, default 999 (`api/events/[id]/signups/route.ts:41`) → queue jumping
- Bot withdraw HARD-deletes (`db.ts:72-75`) while all reads filter `.neq('status','withdrawn')` (soft-delete design unused)
No capacity enforcement anywhere — `event.capacity` is display-only.
**Failure:** duplicate priorities, permanent gaps, nondeterministic queue order.

### §1.3 Two verify-token systems, one broken — CRITICAL
Bot: `Math.random()` token, inserts `{token, user_id, expires_at}` (`bot/core/db.ts:107-116`).
Web: `crypto.randomBytes(32)`, inserts `{discord_id, ...}`, rate-limited (`api/verify/token/route.ts`).
Callback consumes via `verifyToken.discord_id` (`api/verify/callback/route.ts:144`) —
bot-issued tokens have no discord_id → user update matches 0 rows, NO error, user
redirected to `/portal?verified=1` **with nothing saved**. Bot also bypasses the rate
limiter, uses weak entropy, and says "10 minutes" while web issues 15.

---

## 2. Async & concurrency

### §2.1 Read-then-write everywhere, transactions nowhere — CRITICAL
- Draft `pick_number = count + 1` (`api/draft/[id]/picks/route.ts:60-64`) — concurrent picks collide.
  Unique constraints exist only in `supabase/phase0_draft_picks_constraints.sql`, a
  run-by-hand worksheet — application to prod UNVERIFIED.
- Undo deletes "last pick by picked_at" (`api/draft/[id]/undo/route.ts:18-24`) —
  races with concurrent pick → wrong pick deleted.
- Bot signup priority count+1 (`bot/core/db.ts:62-65`).
- Lobby start readiness check is TOCTOU (`api/draft/[id]/lobby/start/route.ts:17-32`).

### §2.2 Match confirm pipeline non-atomic + non-idempotent — CRITICAL
`confirm` = update → recalcStandings → advanceBracket → audit as 4 independent awaits
(`api/tournaments/[id]/matches/[matchId]/route.ts:123-161`). NO status guard.
`advanceBracket` writes winner into "first empty slot" (`route.ts:319-332`):
- **Double-confirm** → winner written into BOTH slots of next match (team plays itself)
- **Edit after advancement** → new winner appended to other slot; old winner stays;
  may overwrite the other semifinal's legitimate winner
- **Reject after advancement** (`route.ts:164-193`) → next match keeps the team that
  advanced off the rejected result; no un-advancement exists

### §2.3 recalcStandings = lost-update machine — HIGH
Read all complete matches → compute in memory → per-team update loop
(`route.ts:272-317`). Concurrent confirms in same group interleave; last writer wins
with stale data. No drift detection possible.

---

## 3. Coupling & boundaries

### §3.1 Two divergent result-ingestion pipelines — CRITICAL
1. KTPBridge → direct DB write: scores, `status='awaiting_confirmation'`, **NO winner_id, NO audit**
2. API `action:'report'` (BOT_SECRET): requires winner_id, writes audit
Confirm assumes winner_id → KTP-reported match confirmed = `complete` with null winner;
recalcStandings skips it silently (`route.ts:294`), advanceBracket no-ops (`route.ts:320`).

### §3.2 KTPBridge trusts the whole channel, matches by substring — CRITICAL
Fires on ANY bot message in results channel (`bot/index.ts:89-93`). Parses first
`\d+[:-]\d+` anywhere (dates/round labels match). Assigns to a pending match if both
team names are case-insensitive SUBSTRINGS (`KTPBridge.ts:56-59`), scanning ALL
tournaments globally. Team "Red" matches anything containing "red". Any webhook can
write scores. Re-posted embeds re-clobber. No idempotency.

### §3.3 Web app is a second unmanaged Discord bot — HIGH
Raw fetches to discord.com with DISCORD_BOT_TOKEN from `lobby/route.ts:73`,
`reset/route.ts:48`, `verify/grant/route.ts`. No 429 handling/retry; bot + web share
one invisible rate budget. `verify/callback` calls ITS OWN server over HTTP at
`/api/verify/grant` authenticated with BOT_SECRET (`callback/route.ts:152-170`).

### §3.4 Two disagreeing authz systems — HIGH
Web: DB flags in JWT, 5-min TTL; on DB error stale elevated roles retained
(`auth.ts:87-89`). Bot: Discord role NAME string-match against hardcoded list
(`draftday.ts:13-15`) — renaming a role silently strips bot admin.
ALSO: `is_captain` is GLOBAL — any captain can confirm ANY match in ANY tournament
(`matches/[matchId]/route.ts:111`), including tournaments they're not in. Live issue.

---

## 4. Frontend/backend confusion

### §4.1 Draft rules enforced only in the browser — CRITICAL
Picks endpoint validates ONLY captain-of-team (`picks/route.ts:36-45`). Missing:
turn order (snake computed client-side, `draft/page.tsx:189-192`), event status check,
drafted-user-is-signed-up check, captain/withdrawn/checked-in checks. Pick clock is a
client setInterval. Stale tab or crafted POST = out-of-turn picks, drafting non-participants.

### §4.2 Client data trusted in privileged writes — MEDIUM
- signups POST takes priority from body (§1.2)
- `users/[id]` PATCH passes RAW BODY to `.update(body)` (`users/[id]/route.ts:47-50`) — mass assignment (superuser-gated)
- All routes `select('*')` via service-role client incl. unauthenticated GETs
  (`events/[id]/route.ts:7-16`) — any new column ships publicly by default

---

## 5. Operational

### §5.1 NEXT_PUBLIC_DEV_MODE auto-promotes every login to admin — CRITICAL
`auth.ts:30-32`. Live testing began 2026-06-01 — if flag still set in Railway, every
login since is an organizer. Also first-user-is-admin count race (`auth.ts:23-26`).
**Verify in Railway immediately.**

### §5.2 No migrations / schema source of truth — HIGH
Schema exists only in prod DB. Two ad-hoc SQL worksheets. Constraints unverifiable.
Staging unconstructible.

### §5.3 No tests; docs describe deleted architecture — HIGH
Zero tests in either project. CLAUDE.md documents the phantom 13-phase manager bot.
For an AI-assisted codebase, stale docs are an active hazard.

### §5.4 Failures silent by policy — MEDIUM
Empty `catch {}` on all public Discord sends (`signup.ts:148`, `checkin.ts:61`,
`withdraw.ts:73,96`, `draftday.ts:150`). Audit logger swallows failures (`audit.ts:23-25`).
KTPBridge ignores update errors. Observability = console.log + Railway scroll.

### §5.5 Wrong check-in count displayed — LOW
Check-in embed shows `getSignupCount()` (total signups) labeled "checked in"
(`checkin.ts:51-58`).

---

## 5b. Database-layer findings (added 2026-06-12, from live DB audit during R2/R3)

These are not visible from the application code — they only surface against the running
database. Both are CRITICAL and partially **invert** earlier findings: the route-level
issues in §1.2/§4.1/§4.2 assumed the API routes are the write path. They are not the
*only* write path.

### §5.6 RLS disabled on every table + anon role has full write grants — CRITICAL
All 20 public tables have `rowsecurity = false`, AND both `anon` and `authenticated`
roles hold `INSERT, UPDATE, DELETE, TRUNCATE, SELECT` on them. The `anon` key is
`NEXT_PUBLIC_*` — it ships in the browser bundle, i.e. it is public by design.
**Confirmed live:** a PATCH to `/rest/v1/users` with only the anon key returned HTTP 200
(write permitted; changed 0 rows only because the test WHERE matched nothing). A real
`?id=eq.<self>` with body `{"is_superuser":true}` would succeed.
**This means every route-handler authorization check is decorative.** An attacker doesn't
need the API at all — they can hit PostgREST directly with the public key and
`UPDATE users SET is_superuser=true`, `DELETE FROM tournament_matches`, or
`TRUNCATE signups`. Full read/write/destroy of the entire database via a key that is in
every visitor's browser. Supersedes §4.1/§4.2 in severity — those describe holes in a
door that has no wall next to it.
**Mitigation path:** R2b (revoke anon/authenticated write grants — safe, app writes use
service_role) now; RLS policies later. See remediation R2b.

### §5.7 Audit logging writes to a nonexistent table — HIGH
`src/lib/audit.ts:15` inserts into `audit_log`. There is no `public.audit_log` table
(`to_regclass` returns NULL). The only audit-named table is `audit_log_entries`, which
is not in the `public` schema (so PostgREST can't reach it either). Every `logAudit()`
call therefore throws, is swallowed by the `catch` (§5.4), and logs nothing.
**Consequence:** there is effectively NO audit trail. Every place the review credited
with "writes audit" (match report/confirm/edit §3.1, role changes, etc.) records nothing.
For a competitive community with disputes, this means no forensic record of who changed
what. Fix is either creating `public.audit_log` or pointing the insert at the real table.

### §6.1 Four sync strategies; refetch storms — HIGH
Draft: realtime → full `fetchAll` per change (`draft/page.tsx:154-155`). Lobby: 3s
polling. Tournament: realtime with GLOBAL channel names (`'tournament-matches'`,
`tournament/page.tsx:128`) — concurrent tournaments cross-trigger. Cost = viewers ×
events × writes; 100 spectators → 100 full refetches per pick.

### §6.2 Hardcoded community/bracket shape — MEDIUM
Single guild/channels via env vars, inconsistent names (GUILD_ID vs DISCORD_GUILD_ID).
seed-playoffs hardcodes 2 groups 'A'/'B', 4 QF/2 SF/1 F (`seed-playoffs/route.ts:50-58`);
NO guard against reseeding mid-playoffs (rewires next_match_id under live matches).

---

## Severity roll-up

| § | Finding | Severity |
|---|---|---|
| 5.6 | **RLS off + anon write grants → full DB compromise via public key** | Critical |
| 5.1 | DEV_MODE grants admin to all logins | Critical |
| 2.2 | Bracket corruption (double-confirm/edit/reject) | Critical |
| 4.1 | Draft rules client-side only | Critical |
| 3.2 | KTPBridge unauthenticated substring writes | Critical |
| 1.3 | Dual verify flows; bot path broken/weak | Critical |
| 2.1 | Read-then-write races (picks/priority/undo) | Critical |
| 3.1 | Divergent result ingestion (null winner hole) | Critical |
| 1.2 | signups 3 writers / client priority / no capacity | High |
| 2.3 | Standings lost updates | High |
| 3.3 | Web as second Discord client | High |
| 3.4 | Disagreeing authz + global is_captain | High |
| 1.1 | No active-event owner | High |
| 5.2 | No migrations | High |
| 5.3 | No tests; phantom docs | High |
| 6.1 | Sync incoherence / refetch storms | High |
| 4.2 | Mass assignment; service-role public GETs | Medium |
| 5.7 | Audit log writes to nonexistent table → no audit trail | High |
| 5.4 | Silent failures | Medium |
| 6.2 | Hardcoded bracket; reseed footgun | Medium |
| 5.5 | Wrong check-in count | Low |
