import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/draft/[id]/lobby/start — admin starts the draft, all lobby clients redirect
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !session?.user?.isSuperUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const body = await (async () => { try { return await (_req as any).json() } catch { return {} } })()
  const force = !!body?.force

  if (!force) {
    const { data: lobbyRows } = await supabase
      .from('draft_lobby')
      .select('user_id')
      .eq('event_id', params.id)
    const { data: teams } = await supabase
      .from('teams')
      .select('captain_id')
      .eq('event_id', params.id)
      .not('captain_id', 'is', null)
    const captainCount = teams?.length ?? 0
    const readyCount = lobbyRows?.length ?? 0
    if (captainCount > 0 && readyCount < captainCount) {
      return NextResponse.json({ error: `Only ${readyCount} of ${captainCount} captains are ready`, notReady: true }, { status: 409 })
    }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'drafting', updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
