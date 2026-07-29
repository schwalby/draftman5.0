-- Migration 006 — Add player names + server to public.ktp_debug_log
-- 2026-07-29
--
-- Only Steam IDs were being pulled out of the Allies/Axis fields, discarding the display
-- name each player posted under and the KTP server name from the footer. Both are useful
-- for eyeballing a debug row against the real Discord message, so capture them too.

ALTER TABLE public.ktp_debug_log ADD COLUMN IF NOT EXISTS allies_names text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.ktp_debug_log ADD COLUMN IF NOT EXISTS axis_names   text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.ktp_debug_log ADD COLUMN IF NOT EXISTS server       text;
