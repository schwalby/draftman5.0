import { getSupabaseAdmin } from '@/lib/supabase'

export interface AuditParams {
  action: string
  actorId?: string | null
  actorName?: string | null
  targetId?: string | null
  targetName?: string | null
  metadata?: Record<string, unknown>
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('audit_log').insert({
      action: params.action,
      actor_id: params.actorId ?? null,
      actor_name: params.actorName ?? null,
      target_id: params.targetId ?? null,
      target_name: params.targetName ?? null,
      metadata: params.metadata ?? {},
    })
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err)
  }
}
