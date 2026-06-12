-- Migration 001 — Revoke anon/authenticated write grants on all public tables (§5.6 / R2b)
-- 2026-06-12
--
-- Context: RLS is disabled on every public table AND the `anon` role (whose key ships
-- publicly in the browser bundle as NEXT_PUBLIC_SUPABASE_ANON_KEY) held full
-- INSERT/UPDATE/DELETE/TRUNCATE. This let anyone with the public key write/delete/truncate
-- any table directly via PostgREST, bypassing all API-route authorization.
--
-- Safe because: the web app and bot perform ALL writes through the service_role key
-- (getSupabaseAdmin / bot core), which is unaffected by REVOKE. The browser only SELECTs
-- (incl. realtime, which is SELECT-based). Verified: no client-side anon writes exist.
--
-- Leaves SELECT intact so client reads + realtime keep working.
-- Follow-up R2c will add RLS + SELECT policies to also restrict anon READ access.

DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
