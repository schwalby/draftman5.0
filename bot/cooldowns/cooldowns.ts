import { supabase } from '../core/supabase'
import { getConfig } from '../config/ConfigManager'

// ── Captain cooldown persistence ──────────────────────────────────────────────
// All functions preserved exactly from index.ts — no logic changes

export async function isOnCooldown(discordId: string): Promise<boolean> {
  const { data } = await supabase
    .from('twelve_man_captain_cooldowns')
    .select('games_remaining')
    .eq('discord_user_id', discordId)
    .maybeSingle()
  return (data?.games_remaining ?? 0) > 0
}

export async function setCooldown(discordId: string, discordUsername: string): Promise<void> {
  await supabase.from('twelve_man_captain_cooldowns').upsert(
    {
      discord_user_id: discordId,
      discord_username: discordUsername,
      games_remaining: getConfig().captain_cooldown_games,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'discord_user_id' },
  )
}

export async function decrementCooldowns(aId: string, bId: string): Promise<void> {
  for (const id of [aId, bId]) {
    const { data } = await supabase
      .from('twelve_man_captain_cooldowns')
      .select('games_remaining')
      .eq('discord_user_id', id)
      .maybeSingle()
    const cur = data?.games_remaining ?? 0
    if (cur > 0) {
      await supabase
        .from('twelve_man_captain_cooldowns')
        .update({ games_remaining: cur - 1, updated_at: new Date().toISOString() })
        .eq('discord_user_id', id)
    }
  }
}
