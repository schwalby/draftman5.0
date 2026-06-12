-- Migration 002 — Create public.audit_log (§5.7 / R2d)
-- 2026-06-12
--
-- src/lib/audit.ts inserts into `audit_log`, which did not exist → every logAudit() call
-- threw and was swallowed by its catch, so there was NO audit trail at all. This creates
-- the table matching the insert shape in audit.ts (action, actor_id, actor_name,
-- target_id, target_name, metadata).
--
-- id/actor_id/target_id are stored as TEXT (not uuid + FK): callers pass UUID strings or
-- null, and audit rows must survive deletion of the referenced user/match/team. No FKs.
-- Granted to service_role only — the app writes audit via the service-role client. anon
-- and authenticated get nothing (audit log is not client-facing).

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text        NOT NULL,
  actor_id    text,
  actor_name  text,
  target_id   text,
  target_name text,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx     ON public.audit_log (action);

GRANT SELECT, INSERT ON public.audit_log TO service_role;
