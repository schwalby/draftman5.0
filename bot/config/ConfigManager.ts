import { supabase } from '../core/supabase'
import { BotConfig } from '../core/types'

// ── Default config ────────────────────────────────────────────────────────────
// Preserved exactly from index.ts
export const DEFAULT_CONFIG: BotConfig = {
  queue_size: 12,
  timeout_minutes: 90,
  activity_window_minutes: 5,
  sub_window_minutes: 2,
  captain_cooldown_games: 2,
  map_count: 5,
  vote_threshold: 7,
  captain_vote_seconds: 120,
  map_vote_seconds: 90,
  server_vote_seconds: 90,
  result_delay_minutes: 38,
  vote_order: ['captain', 'map', 'server', 'draft'],
  server_locations: ['Atlanta', 'Chicago', 'Dallas', 'Denver', 'New York'],
  header_style: 'shadow',
}

// ── Config state ──────────────────────────────────────────────────────────────
// ConfigManager owns botConfig — other modules call getConfig()
let _botConfig: BotConfig = { ...DEFAULT_CONFIG }

export function getConfig(): BotConfig {
  return _botConfig
}

// ── loadConfig ────────────────────────────────────────────────────────────────
// Preserved exactly from index.ts
// Returns queue_message_id so caller can update queue state
export async function loadConfig(
  guildId: string,
  onQueueMessageId: (id: string) => void,
): Promise<void> {
  const { data } = await supabase
    .from('twelve_man_config')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle()

  if (!data) { console.log('[bot] Using default config'); return }

  _botConfig = {
    queue_size:              data.queue_size              ?? DEFAULT_CONFIG.queue_size,
    timeout_minutes:         data.timeout_minutes         ?? DEFAULT_CONFIG.timeout_minutes,
    activity_window_minutes: data.activity_window_minutes ?? DEFAULT_CONFIG.activity_window_minutes,
    sub_window_minutes:      data.sub_window_minutes      ?? DEFAULT_CONFIG.sub_window_minutes,
    captain_cooldown_games:  data.captain_cooldown_games  ?? DEFAULT_CONFIG.captain_cooldown_games,
    map_count:               data.map_count               ?? DEFAULT_CONFIG.map_count,
    vote_threshold:          data.vote_threshold          ?? DEFAULT_CONFIG.vote_threshold,
    captain_vote_seconds:    data.captain_vote_seconds    ?? DEFAULT_CONFIG.captain_vote_seconds,
    map_vote_seconds:        data.map_vote_seconds        ?? DEFAULT_CONFIG.map_vote_seconds,
    server_vote_seconds:     data.server_vote_seconds     ?? DEFAULT_CONFIG.server_vote_seconds,
    result_delay_minutes:    data.result_delay_minutes    ?? DEFAULT_CONFIG.result_delay_minutes,
    vote_order:              data.vote_order              ?? DEFAULT_CONFIG.vote_order,
    server_locations:        data.server_locations        ?? DEFAULT_CONFIG.server_locations,
    header_style:            (data.header_style           ?? DEFAULT_CONFIG.header_style) as BotConfig['header_style'],
  }

  if (data.queue_message_id) onQueueMessageId(data.queue_message_id)
  console.log('[bot] Config loaded')
}

// ── saveQueueMessageId ────────────────────────────────────────────────────────
// Preserved exactly from index.ts
export async function saveQueueMessageId(
  id: string,
  guildId: string,
): Promise<void> {
  await supabase
    .from('twelve_man_config')
    .update({ queue_message_id: id })
    .eq('guild_id', guildId)
}

// ── getMapPool ────────────────────────────────────────────────────────────────
// Preserved exactly from index.ts
export async function getMapPool(guildId: string): Promise<string[]> {
  const { data } = await supabase
    .from('map_pool')
    .select('map_name')
    .eq('guild_id', guildId)
    .eq('active', true)
  return data?.map((r: any) => r.map_name) ?? []
}

// ── updateConfig ──────────────────────────────────────────────────────────────
// Allows in-place mutation of config (used by settings command)
export function updateConfig(partial: Partial<BotConfig>): void {
  _botConfig = { ..._botConfig, ...partial }
}
