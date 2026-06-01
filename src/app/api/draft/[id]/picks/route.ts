import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireFields } from '@/lib/validate'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('draft_picks')
    .select('*, user:users(ingame_name, discord_username)')
    .eq('event_id', params.id)
    .order('picked_at', { ascending: true })

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
  const err = requireFields(body, ['user_id', 'team_id'])
  if (err) return err
  const { user_id, team_id, class: assignedClass } = body
  const supabase = getSupabaseAdmin()

  // Verify caller is organizer or the captain of the team
  if (!session.user.isOrganizer && !session.user.isSuperUser) {
    const { data: team } = await supabase
      .from('teams')
      .select('captain_id')
      .eq('id', team_id)
      .single()
    if (!team || team.captain_id !== session.user.userId) {
      return NextResponse.json({ error: 'Not authorized to pick for this team' }, { status: 403 })
    }
  }

  // Use class from modal if provided, otherwise fall back to signup first class
  let playerClass = assignedClass || null
  if (!playerClass) {
    const { data: signup } = await supabase
      .from('signups')
      .select('class')
      .eq('event_id', params.id)
      .eq('user_id', user_id)
      .single()
    playerClass = signup?.class?.[0] || 'flex'
  }

  // Generate pick_number server-side — never trust client-supplied ordering
  const { count } = await supabase
    .from('draft_picks')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', params.id)
  const pickNumber = (count ?? 0) + 1

  const { data, error } = await supabase
    .from('draft_picks')
    .insert({
      event_id: params.id,
      team_id,
      user_id,
      pick_number: pickNumber,
      class: playerClass,
      picked_at: new Date().toISOString(),
    })
    .select('*, user:users(ingame_name, discord_username)')
    .single()

  if (error) {
    if ((error as any).code === '23503') {
      return NextResponse.json({ error: 'Team data is out of date — refresh the page and try again.', stale: true }, { status: 409 })
    }
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'That pick was already made.', stale: true }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
