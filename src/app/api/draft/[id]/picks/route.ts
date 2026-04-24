import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabaseAdmin
    .from('draft_picks')
    .select('*, user:users(ingame_name, discord_username)')
    .eq('event_id', params.id)
    .order('pick_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { user_id, team_id, pick_number } = body

  // Verify caller is organizer or the captain of the team
  if (!session.user.isOrganizer && !session.user.isSuperUser) {
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('captain_id')
      .eq('id', team_id)
      .single()
    if (!team || team.captain_id !== session.user.userId) {
      return NextResponse.json({ error: 'Not authorized to pick for this team' }, { status: 403 })
    }
  }

  // Get the player's class from signups
  const { data: signup } = await supabaseAdmin
    .from('signups')
    .select('class')
    .eq('event_id', params.id)
    .eq('user_id', user_id)
    .single()

  const playerClass = signup?.class?.[0] || 'flex'

  const { data, error } = await supabaseAdmin
    .from('draft_picks')
    .insert({
      event_id: params.id,
      team_id,
      user_id,
      pick_number,
      class: playerClass,
      picked_at: new Date().toISOString(),
    })
    .select('*, user:users(ingame_name, discord_username)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
