-- Migration 004 — Create public.ktp_debug_log
-- 2026-07-28
--
-- Temporary-but-permanent diagnostic table for bot/bridge/KTPBridge.ts. The bot inserts
-- one row per parsed KTP "MATCH COMPLETE" embed (12man or draft), recording what it parsed
-- and exactly where it stopped (12man skip, no pending match, team resolution failure,
-- reported, etc). Built to verify the KTP embed parser against real match traffic before
-- the first live drafted tournament, using 12man games as a data source since no draft is
-- currently in progress. Read via /api/admin/ktp-debug (SuperUser/Organizer only) from
-- /admin/ktp-debug.
--
-- Service-role only — the bot and the admin API route both use the service-role client.
-- Not client-facing, no anon/authenticated grants.

CREATE TABLE IF NOT EXISTS public.ktp_debug_log (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  is_12man                    boolean     NOT NULL,
  winning_side                text,
  score_allies                integer,
  score_axis                  integer,
  half1_allies                integer,
  half1_axis                  integer,
  half2_allies                integer,
  half2_axis                  integer,
  map                         text,
  ktp_match_id                text,
  allies_steam_ids            text[]      NOT NULL DEFAULT '{}',
  axis_steam_ids              text[]      NOT NULL DEFAULT '{}',
  resolved_team_allies        uuid,
  resolved_team_axis          uuid,
  matched_tournament_match_id uuid,
  report_status               text        NOT NULL,
  report_detail               text
);

CREATE INDEX IF NOT EXISTS ktp_debug_log_created_at_idx ON public.ktp_debug_log (created_at DESC);

GRANT SELECT, INSERT ON public.ktp_debug_log TO service_role;
