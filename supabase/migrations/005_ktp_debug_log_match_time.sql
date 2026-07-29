-- Migration 005 — Add message_created_at to public.ktp_debug_log
-- 2026-07-29
--
-- ktp_debug_log.created_at is when the row was WRITTEN (bot processing time), not when
-- the match actually happened. That's fine for live traffic (rows land in real order),
-- but the backfill script (bot/scripts/backfill-ktp.ts) processes a whole day's messages
-- in a tight loop, newest-Discord-message-first, so all rows get near-identical
-- created_at values in reverse chronological order relative to the actual matches.
-- Adding the real Discord message timestamp lets the debug page sort by when the match
-- happened instead of when the bot got around to logging it.

ALTER TABLE public.ktp_debug_log ADD COLUMN IF NOT EXISTS message_created_at timestamptz;

CREATE INDEX IF NOT EXISTS ktp_debug_log_message_created_at_idx
  ON public.ktp_debug_log (message_created_at DESC);
