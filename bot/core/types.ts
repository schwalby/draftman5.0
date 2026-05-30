export interface DbUser {
  id: string
  discord_id: string
  discord_username: string
  ingame_name: string | null
  steam_id: string | null
  steam_name: string | null
  steam_avatar: string | null
  steam_verified: boolean
  is_organizer: boolean
  is_superuser: boolean
}

export interface DbEvent {
  id: string
  name: string
  status: string
  type: string
  format: string
  half_length: number
  capacity: number
  starts_at: string | null
  checkin_opens_at: string | null
  signup_opens_at: string | null
}

export interface DbSignup {
  id: string
  event_id: string
  user_id: string
  class: string[]
  status: string
  ringer: boolean
  checked_in: boolean
}

export const CLASS_COLORS: Record<string, number> = {
  rifle:  0xc8a050,
  third:  0x4a9c6a,
  heavy:  0x9c5a4a,
  sniper: 0x5a6a9c,
  flex:   0x888888,
}

export const CLASS_LABELS: Record<string, string> = {
  rifle:  'Rifle',
  third:  'Third',
  heavy:  'Heavy',
  sniper: 'Sniper',
  flex:   'Flex',
}

export const CLASSES = ['rifle', 'third', 'heavy', 'sniper', 'flex'] as const
