export const CLASS_EMOJI_NAMES: Record<string, string> = {
  rifle:  'k98',
  third:  'stoss',
  heavy:  'bar',
  sniper: 'axissniper',
  flex:   'shovel',  // will try shovel variants
}

export const classEmojis: Record<string, string> = {}

export function resolveEmojis(guildEmojis: Map<string, { id: string; name: string | null }>) {
  // Log all available emoji names for debugging
  const allNames = [...guildEmojis.values()].map(e => e.name).filter(Boolean)
  console.log('[emojis] Available:', allNames.join(', '))

  for (const [cls, name] of Object.entries(CLASS_EMOJI_NAMES)) {
    // Exact match first, then startsWith for shovel~1 type cases
    const found = [...guildEmojis.values()].find(e => e.name === name)
      ?? [...guildEmojis.values()].find(e => e.name?.startsWith(name))
    if (found) {
      classEmojis[cls] = found.id
      console.log(`[emojis] ${cls} → :${found.name}:${found.id}`)
    } else {
      console.warn(`[emojis] ❌ No emoji found for ${cls} (tried "${name}")`)
    }
  }
}
