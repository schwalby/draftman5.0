import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { data: teams, error } = await supabaseAdmin
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

    // Delete existing teams for this event before reinserting
    const { error: deleteError } = await supabaseAdmin
      .from('teams')
      .delete()
      .eq('event_id', params.id)

    if (deleteError) {
      console.error('DELETE existing teams error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

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

    const { data, error } = await supabaseAdmin
      .from('teams')
      .insert(rows)
      .select()

    if (error) {
      console.error('INSERT teams error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ teams: data })
  } catch (err) {
    console.error('POST teams exception:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
