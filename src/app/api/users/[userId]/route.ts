import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !(session?.user as any)?.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId } = params

  // Fetch user
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id, ingame_name, discord_username, discord_avatar, discord_id, is_organizer, is_superuser, is_captain, created_at')
    .eq('id', userId)
    .single()

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 })

  // Fetch their signups with event info
  const { data: signups } = await supabaseAdmin
    .from('signups')
    .select('id, class, priority, ringer, captain, flagged, checked_in, signed_up_at, events(id, name, starts_at, format, status)')
    .eq('user_id', userId)
    .order('signed_up_at', { ascending: false })

  // Fetch their draft picks with event and team info
  const { data: draftPicks } = await supabaseAdmin
    .from('draft_picks')
    .select('id, pick_number, class, picked_at, events(id, name, starts_at, format), teams(id, name, color)')
    .eq('user_id', userId)
    .order('picked_at', { ascending: false })

  return NextResponse.json({ user, signups: signups || [], draftPicks: draftPicks || [] })
}
