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

  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const base  = host ? `${proto}://${host}` : (process.env.NEXTAUTH_URL ?? 'https://draftman50-production.up.railway.app')

  if (!token) {
    return NextResponse.redirect(new URL('/verify?error=missing_token', base))
  }

  // ── 1. Atomically consume the token (fixes race condition) ─────────────────
  const { data: verifyToken, error: tokenErr } = await supabase
    .from('verify_tokens')
    .update({ used: true })
    .eq('token', token)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .select()
    .maybeSingle()

  if (tokenErr || !verifyToken) {
    const { data: deadToken } = await supabase
      .from('verify_tokens')
      .select('used, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (!deadToken) {
      return NextResponse.redirect(new URL('/verify?error=invalid_token', base))
    }
    if (new Date(deadToken.expires_at) < new Date()) {
      return NextResponse.redirect(new URL('/verify?error=expired_token', base))
    }
    return NextResponse.redirect(new URL('/verify?error=invalid_token', base))
  }

  // ── 2. Validate Steam OpenID response ──────────────────────────────────────
  const mode = searchParams.get('openid.mode')
  if (mode !== 'id_res') {
    return NextResponse.redirect(new URL('/verify?error=steam_cancelled', base))
  }

  const claimedId = searchParams.get('openid.claimed_id') ?? ''
  const steamId64Match = claimedId.match(/\/(\d{17})$/)
  if (!steamId64Match) {
    return NextResponse.redirect(new URL('/verify?error=steam_id_parse', base))
  }
  const steamId64 = steamId64Match[1]

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
    return NextResponse.redirect(new URL('/verify?error=steam_invalid', base))
  }

  // ── 3. Fetch Steam profile ─────────────────────────────────────────────────
  const summaryRes = await fetch(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId64}`
  )
  const summaryData = await summaryRes.json()
  const player = summaryData?.response?.players?.[0]

  if (!player) {
    return NextResponse.redirect(new URL('/verify?error=steam_profile_not_found', base))
  }

  if (player.communityvisibilitystate < 3) {
    return NextResponse.redirect(new URL('/verify?error=private', base))
  }

  // ── 4. Check account age ───────────────────────────────────────────────────
  const timecreated = player.timecreated
  if (!timecreated) {
    return NextResponse.redirect(new URL('/verify?error=steam_profile_not_found', base))
  }

  const accountAgeDays = (Date.now() / 1000 - timecreated) / 86400
  if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS) {
    const daysLeft = Math.ceil(MIN_ACCOUNT_AGE_DAYS - accountAgeDays)
    return NextResponse.redirect(new URL(`/verify?error=too_new&days_left=${daysLeft}`, base))
  }

  // ── 5. Check DoD ownership ─────────────────────────────────────────────────
  const gamesRes = await fetch(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId64}&include_appinfo=false`
  )
  const gamesData = await gamesRes.json()
  const games: { appid: number }[] = gamesData?.response?.games ?? []

  if (games.length === 0) {
    return NextResponse.redirect(new URL('/verify?error=private', base))
  }

  const ownsDoD = games.some(g => g.appid === DOD_APP_ID)
  if (!ownsDoD) {
    return NextResponse.redirect(new URL('/verify?error=no_dod', base))
  }

  // ── 6. All checks passed — save to DB ─────────────────────────────────────
  const steamName   = player.personaname ?? null
  const steamAvatar = player.avatarfull ?? player.avatar ?? null

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
    return NextResponse.redirect(new URL('/verify?error=db_error', base))
  }

  // ── 7. Notify bot to grant Discord role ────────────────────────────────────
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
    }
  } catch (err) {
    console.error('[verify/callback] Failed to reach grant endpoint:', err)
  }

  return NextResponse.redirect(new URL('/portal?verified=1', base))
}
