import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/draft/[id]/lobby — teams + captain ready status
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()

  const [teamsRes, readyRes, eventRes] = await Promise.all([
    supabase
      .from('teams')
      .select('id, name, color, pick_order, captain_id, captain:users(ingame_name, discord_username)')
      .eq('event_id', params.id)
      .order('pick_order'),
    supabase
      .from('draft_lobby')
      .select('user_id')
      .eq('event_id', params.id),
    supabase
      .from('events')
      .select('id, name, status')
      .eq('id', params.id)
      .single(),
  ])

  const teams = teamsRes.data ?? []
  const readySet = new Set((readyRes.data ?? []).map((r: any) => r.user_id))
  const captainTeams = teams.filter((t: any) => t.captain_id)
  const readyCount = captainTeams.filter((t: any) => readySet.has(t.captain_id)).length

  return NextResponse.json({
    event: eventRes.data,
    teams: teams.map((t: any) => ({ ...t, captain_ready: readySet.has(t.captain_id) })),
    readyCount,
    totalCaptains: captainTeams.length,
    allReady: captainTeams.length > 0 && readyCount === captainTeams.length,
  })
}

// POST /api/draft/[id]/lobby — open lobby + ping #captains-chat
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !session?.user?.isSuperUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', params.id)
    .single()

  const channelId = process.env.CAPTAINS_CHAT_CHANNEL_ID
  const token = process.env.DISCORD_BOT_TOKEN
  const baseUrl = process.env.NEXTAUTH_URL ?? ''

  if (channelId && token) {
    const lobbyUrl = `${baseUrl}/events/${params.id}/draft/lobby`
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `🟡 **${event?.name ?? 'Draft'} — Lobby is open**\nAll captains head here to ready up: ${lobbyUrl}`,
      }),
    })
  }

  return NextResponse.json({ ok: true })
}
