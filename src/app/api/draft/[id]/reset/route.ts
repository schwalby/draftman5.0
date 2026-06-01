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

  const { data: event } = await supabase
    .from('events')
    .select('name')
    .eq('id', id)
    .single()

  const [picksRes, lobbyRes, statusRes] = await Promise.all([
    supabase.from('draft_picks').delete().eq('event_id', id),
    supabase.from('draft_lobby').delete().eq('event_id', id),
    supabase.from('events').update({ status: 'lobby', updated_at: new Date().toISOString() }).eq('id', id),
  ])

  const err = picksRes.error || lobbyRes.error || statusRes.error
  if (err) {
    console.error('Reset draft error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  // Repost lobby link to #captains-chat
  const channelId = process.env.CAPTAINS_CHAT_CHANNEL_ID
  const token = process.env.DISCORD_BOT_TOKEN
  const roleId = process.env.CAPTAINS_ROLE_ID
  const baseUrl = process.env.NEXTAUTH_URL ?? ''
  if (channelId && token) {
    const lobbyUrl = `${baseUrl}/events/${id}/draft/lobby`
    const mention = roleId ? `<@&${roleId}> ` : ''
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${mention}🔄 **${event?.name ?? 'Draft'} — Lobby reset**\nCaptains please re-ready up here: ${lobbyUrl}`,
      }),
    })
  }

  return NextResponse.json({ success: true })
}
