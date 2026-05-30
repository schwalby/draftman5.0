import { BotConfig } from './types'

// ── Discord ───────────────────────────────────────────────────────────────────
export const QUEUE_CATEGORY_ID = '1130992813627154452'
export const MATCH_THRESHOLD   = 8

// ── Env ───────────────────────────────────────────────────────────────────────
export const REQUIRED_ENV = [
  'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID',
  'DISCORD_VERIFIED_ROLE_ID', 'BOT_SECRET', 'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 'API_BASE_URL', 'RESULTS_CHANNEL_ID', 'QUEUE_CHANNEL_ID',
]

// ── Default config ────────────────────────────────────────────────────────────
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

// ── Admin role names ──────────────────────────────────────────────────────────
export const ADMIN_ROLE_NAMES = ['Administrator', 'Sapphire', 'Mod', 'Moderator']
export const CHANNEL_ADMIN_ROLE_NAMES = ['Administrator', 'Sapphire', 'Spectator', 'ModMail', '12man special privileges', 'Chanserv']

// ── Rate limiting ─────────────────────────────────────────────────────────────
export const INTERACTION_COOLDOWN_MS = 800
