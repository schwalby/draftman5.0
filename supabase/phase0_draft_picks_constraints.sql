-- Phase 0 Migration: draft_picks uniqueness constraints
-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)
--
-- STEP 1: Run these two queries first to check for existing violations.
-- If either returns rows, you have duplicate data that must be resolved before
-- the constraints can be added. Come back with the results and we'll fix them.

-- Check for duplicate (event_id, user_id) — same player picked twice in one event
SELECT event_id, user_id, COUNT(*) as duplicate_count
FROM draft_picks
GROUP BY event_id, user_id
HAVING COUNT(*) > 1;

-- Check for duplicate (event_id, pick_number) — two picks with the same position
SELECT event_id, pick_number, COUNT(*) as duplicate_count
FROM draft_picks
GROUP BY event_id, pick_number
HAVING COUNT(*) > 1;


-- STEP 2: Only run these if BOTH queries above returned zero rows.

ALTER TABLE draft_picks
  ADD CONSTRAINT draft_picks_event_user_unique UNIQUE (event_id, user_id);

ALTER TABLE draft_picks
  ADD CONSTRAINT draft_picks_event_pick_unique UNIQUE (event_id, pick_number);
