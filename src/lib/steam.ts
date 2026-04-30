/**
 * Steam ID utilities for DRAFTMAN5.0
 *
 * Accepts:
 *   - STEAM_0:0:XXXXXXX  (legacy format, as seen in KTP Score Bot embeds)
 *   - STEAM_0:1:XXXXXXX
 *   - 7656119XXXXXXXXXX  (SteamID64)
 *
 * Always stores as SteamID64.
 */

const STEAM_ID64_BASE = BigInt('76561197960265728')

export interface SteamPlayer {
  steamid: string
  personaname: string
  avatarfull: string
  profileurl: string
}

/**
 * Convert any supported Steam ID format to SteamID64 string.
 * Returns null if the format is unrecognized.
 */
export function toSteamId64(input: string): string | null {
  const trimmed = input.trim()

  // Already SteamID64 — 17-digit number starting with 7656119
  if (/^\d{17}$/.test(trimmed) && trimmed.startsWith('7656119')) {
    return trimmed
  }

  // STEAM_0:Y:Z format
  const match = trimmed.match(/^STEAM_0:([01]):(\d+)$/i)
  if (match) {
    const y = BigInt(match[1])
    const z = BigInt(match[2])
    const id64 = STEAM_ID64_BASE + z * BigInt(2) + y
    return id64.toString()
  }

  return null
}

/**
 * Validate a SteamID64 against the Steam Web API.
 * Returns the player data if found, null if not found.
 */
export async function validateSteamId64(steamId64: string): Promise<SteamPlayer | null> {
  const apiKey = process.env.STEAM_API_KEY
  if (!apiKey) {
    console.warn('[steam] STEAM_API_KEY not set — skipping validation')
    return { steamid: steamId64, personaname: '', avatarfull: '', profileurl: '' }
  }

  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId64}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const players: SteamPlayer[] = data?.response?.players ?? []
    return players.length > 0 ? players[0] : null
  } catch (err) {
    console.error('[steam] Validation error:', err)
    return null
  }
}
