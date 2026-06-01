import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !session?.user?.isSuperUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params
  const supabase = getSupabaseAdmin()

  const [picksRes, lobbyRes, statusRes] = await Promise.all([
    supabase.from('draft_picks').delete().eq('event_id', id),
    supabase.from('draft_lobby').delete().eq('event_id', id),
    supabase.from('events').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', id),
  ])

  const err = picksRes.error || lobbyRes.error || statusRes.error
  if (err) {
    console.error('Reset draft error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
