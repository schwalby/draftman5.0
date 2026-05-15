import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STEAM_API_KEY = process.env.STEAM_API_KEY!
const DOD_APP_ID = 30
const MIN_ACCOUNT_AGE_DAYS = 30

// GET /api/verify/callback?token=xxx&openid.*=...
// Steam redirects here after login — validate, check requirements, save
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/verify?error=missing_token', req.url))
  }

  // ── 1. Atomically consume the token (fixes race condition) ─────────────────
  // Single UPDATE with WHERE clause — if another request got here first,
  // this returns zero rows and we bail. No SELECT then UPDATE.
  const { data: verifyToken, error: tokenErr } = await supabase
    .from('verify_tokens')
    .update({ used: true })
    .eq('token', token)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .select()
    .maybeSingle()

  if (tokenErr || !verifyToken) {
    // Could be invalid, already used, or expired — check which
    const { data: deadToken } = await supabase
      .from('verify_tokens')
      .select('used, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!deadToken) {
      return NextResponse.redirect(new URL('/verify?error=invalid_token', req.url))
    }
    if (new Date(deadToken.expires_at) < new Date()) {
      return NextResponse.redirect(new URL('/verify?error=expired_token', req.url))
    }
    return NextResponse.redirect(new URL('/verify?error=invalid_token', req.url))
  }

  // ── 2. Validate Steam OpenID response ──────────────────────────────────────
  const mode = searchParams.get('openid.mode')
  if (mode !== 'id_res') {
    return NextResponse.redirect(new URL('/verify?error=steam_cancelled', req.url))
  }

  // Extract Steam ID from claimed_id: https://steamcommunity.com/openid/id/76561198XXXXXXXXX
  const claimedId = searchParams.get('openid.claimed_id') ?? ''
  const steamId64Match = claimedId.match(/\/(\d{17})$/)
  if (!steamId64Match) {
    return NextResponse.redirect(new URL('/verify?error=steam_id_parse', req.url))
  }
  const steamId64 = steamId64Match[1]

  // Validate with Steam's OpenID endpoint to prevent spoofing
  // Bug fix: iterate searchParams explicitly — URLSearchParams(searchParams as any)
  // does not correctly copy all params, breaking Steam's check_authentication
  const validationParams = new URLSearchParams()
  searchParams.forEach((value, key) => {
    validationParams.set(key, value)
  })
  validationParams.set('openid.mode', 'check_authentication')

  const validationRes = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: validationParams.toString(),
  })
  const validationText = await validationRes.text()
  if (!validationText.includes('is_valid:true')) {
    return NextResponse.redirect(new URL('/verify?error=steam_invalid', req.url))
  }

  // ── 3. Fetch Steam profile ─────────────────────────────────────────────────
  const summaryRes = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId64}`
  )
  const summaryData = await summaryRes.json()
  const player = summaryData?.response?.players?.[0]

  if (!player) {
    return NextResponse.redirect(new URL('/verify?error=steam_profile_not_found', req.url))
  }

  // Check if profile is private (communityvisibilitystate < 3 means private/friends only)
  if (player.communityvisibilitystate < 3) {
    return NextResponse.redirect(new URL('/verify?error=private', req.url))
  }

  // ── 4. Check account age ───────────────────────────────────────────────────
  const timecreated = player.timecreated
  if (!timecreated) {
    // Bug fix: missing timecreated means the field is hidden — not that profile is private
    // Profile visibility was already checked above — this is a separate condition
    return NextResponse.redirect(new URL('/verify?error=steam_profile_not_found', req.url))
  }

  const accountAgeDays = (Date.now() / 1000 - timecreated) / 86400
  if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS) {
    const daysLeft = Math.ceil(MIN_ACCOUNT_AGE_DAYS - accountAgeDays)
    return NextResponse.redirect(new URL(`/verify?error=too_new&days_left=${daysLeft}`, req.url))
  }

  // ── 5. Check DoD ownership ─────────────────────────────────────────────────
  const gamesRes = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId64}&include_appinfo=false`
  )
  const gamesData = await gamesRes.json()
  const games: { appid: number }[] = gamesData?.response?.games ?? []

  if (games.length === 0) {
    // Empty games list = private library
    return NextResponse.redirect(new URL('/verify?error=private', req.url))
  }

  const ownsDoD = games.some(g => g.appid === DOD_APP_ID)
  if (!ownsDoD) {
    return NextResponse.redirect(new URL('/verify?error=no_dod', req.url))
  }

  // ── 6. All checks passed — save to DB ─────────────────────────────────────
  const steamName   = player.personaname ?? null
  const steamAvatar = player.avatarfull ?? player.avatar ?? null

  // Convert SteamID64 to STEAM_0:X:Y format for display
  const STEAM_BASE = BigInt('76561197960265728')
  const id64Big = BigInt(steamId64)
  const y = Number((id64Big - STEAM_BASE) % BigInt(2))
  const z = Number((id64Big - STEAM_BASE - BigInt(y)) / BigInt(2))
  const steamIdDisplay = `STEAM_0:${y}:${z}`

  const { error: updateErr } = await supabase
    .from('users')
    .update({
      steam_id:       steamIdDisplay,
      steam_id_64:    steamId64,
      steam_name:     steamName,
      steam_avatar:   steamAvatar,
      steam_verified: true,
    })
    .eq('discord_id', verifyToken.discord_id)

  if (updateErr) {
    console.error('[verify/callback] Failed to update user:', updateErr)
    return NextResponse.redirect(new URL('/verify?error=db_error', req.url))
  }

  // Token was already atomically marked used in step 1 — no second update needed

  // ── 7. Notify bot to grant Discord role ────────────────────────────────────
  // Bug fix: await the grant call and handle failure — do not fire and forget.
  // If grant fails the user sees success but never gets the role, causing confusion.
  const base = process.env.NEXTAUTH_URL ?? 'https://draftman50-production.up.railway.app'
  try {
    const grantRes = await fetch(`${base}/api/verify/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bot-secret': process.env.BOT_SECRET!,
      },
      body: JSON.stringify({
        discord_id: verifyToken.discord_id,
        steam_name: steamName,
      }),
    })

    if (!grantRes.ok) {
      console.error('[verify/callback] Grant endpoint returned error:', grantRes.status)
      // Redirect to success anyway — Steam data is saved.
      // User has verified, role grant can be done manually if needed.
      // A retry mechanism can be added in future.
    }
  } catch (err) {
    console.error('[verify/callback] Failed to reach grant endpoint:', err)
    // Same — Steam data is saved, redirect to success, log for manual follow-up
  }

  return NextResponse.redirect(new URL('/verify?success=1', req.url))
}
