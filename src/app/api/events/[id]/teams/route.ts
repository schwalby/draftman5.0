import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: teams, error } = await getSupabaseAdmin()
      .from('teams')
      .select('*, captain:captain_id(id, ingame_name, discord_username, is_captain)')
      .eq('event_id', params.id)
      .order('pick_order', { ascending: true })

    if (error) {
      console.error('GET teams error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ teams })
  } catch (err) {
    console.error('GET teams exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { teams } = await req.json()

    if (!teams || !Array.isArray(teams) || teams.length < 2) {
      return NextResponse.json({ error: 'Invalid teams data' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Block re-save if draft is already in progress
    const { data: event } = await supabase
      .from('events')
      .select('status')
      .eq('id', params.id)
      .single()
    if (event?.status === 'drafting' || event?.status === 'lobby') {
      return NextResponse.json({ error: 'Cannot change teams once the lobby is open' }, { status: 409 })
    }

    // Snapshot existing IDs before touching anything
    const { data: existing } = await supabase
      .from('teams')
      .select('id')
      .eq('event_id', params.id)
    const oldIds = existing?.map((t: { id: string }) => t.id) ?? []

    const rows = teams.map((t: {
      name: string
      color: string
      captain_id: string | null
      pick_order: number
    }) => ({
      event_id: params.id,
      name: t.name,
      color: t.color,
      captain_id: t.captain_id || null,
      pick_order: t.pick_order,
    }))

    // Insert first — if this fails, old teams are still intact
    const { data, error } = await supabase
      .from('teams')
      .insert(rows)
      .select()

    if (error) {
      console.error('INSERT teams error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Delete old rows only after successful insert
    if (oldIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('teams')
        .delete()
        .in('id', oldIds)
      if (deleteError) {
        console.error('DELETE old teams error:', deleteError)
      }
    }

    return NextResponse.json({ teams: data })
  } catch (err) {
    console.error('POST teams exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
