-- Migration 003 — Partial unique index on signups (§1.2 / R4)
-- 2026-06-12
--
-- signups has three writers (web, bot signup, bot withdraw) with no uniqueness guard, so
-- a player could hold multiple active signups for one event. This enforces one active
-- (non-withdrawn) signup per (event_id, user_id) at the DB level — turning the race into
-- a 23505 the API can surface as a 409. Withdrawn rows are excluded so a player can
-- re-sign-up after withdrawing.
--
-- Verified before applying: zero existing duplicate non-withdrawn signups in prod.
-- Priority uniqueness is deliberately NOT enforced here — deferred to R8 (server-owned
-- priority), since current priority values are not yet collision-free.

CREATE UNIQUE INDEX IF NOT EXISTS signups_event_user_active_unique
  ON public.signups (event_id, user_id)
  WHERE status <> 'withdrawn';
