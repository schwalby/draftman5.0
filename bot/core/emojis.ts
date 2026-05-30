// Populated at startup from the guild's emoji list
export const CLASS_EMOJI_NAMES: Record<string, string> = {
  rifle:  'k98',
  third:  'stoss',
  heavy:  'bar',
  sniper: 'axissniper',
  flex:   'shovel~1',
}

// Resolved emoji strings ready to use in buttons — set by index.ts on ClientReady
export const classEmojis: Record<string, string> = {}

export function resolveEmoji(name: string, guildEmojis: Map<string, { id: string; name: string | null }>) {
  const found = [...guildEmojis.values()].find(e => e.name === name)
  return found ? { id: found.id, name: found.name ?? name } : null
}
