import { supabase } from '../core/supabase'
import { QueuePlayer } from '../core/types'

// ── Queue persistence ─────────────────────────────────────────────────────────
// All functions preserved exactly from index.ts — no logic changes

export async function persistPlayerJoin(p: QueuePlayer): Promise<void> {
  if (p.fake) return
  await supabase.from('twelve_man_queue_state').upsert(
    {
      discord_user_id: p.discordId,
      discord_username: p.discordUsername,
      joined_at: new Date(p.joinedAt).toISOString(),
      is_waitlist: false,
    },
    { onConflict: 'discord_user_id' },
  )
}

export async function persistPlayerLeave(discordId: string): Promise<void> {
  await supabase
    .from('twelve_man_queue_state')
    .delete()
    .eq('discord_user_id', discordId)
}

export async function clearPersistedQueue(): Promise<void> {
  await supabase
    .from('twelve_man_queue_state')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
}

export async function loadQueueFromDB(): Promise<QueuePlayer[]> {
  const { data } = await supabase
    .from('twelve_man_queue_state')
    .select('*')
    .eq('is_waitlist', false)
    .order('joined_at', { ascending: true })

  if (!data?.length) {
    console.log('[12man] Queue empty on startup')
    return []
  }

  const players = data.map((r: any) => ({
    discordId: r.discord_user_id,
    discordUsername: r.discord_username,
    joinedAt: new Date(r.joined_at).getTime(),
  }))

  console.log(`[12man] Restored ${players.length} players from DB`)
  return players
}
