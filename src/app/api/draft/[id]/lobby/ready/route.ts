import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

// POST /api/draft/[id]/lobby/ready — captain marks themselves ready
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // Must be a captain for this event (or organizer)
  if (!session.user.isOrganizer && !session.user.isSuperUser) {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('event_id', params.id)
      .eq('captain_id', session.user.userId)
      .maybeSingle()

    if (!team) return NextResponse.json({ error: 'Not a captain for this event' }, { status: 403 })
  }

  const { error } = await supabase
    .from('draft_lobby')
    .upsert(
      { event_id: params.id, user_id: session.user.userId },
      { onConflict: 'event_id,user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
