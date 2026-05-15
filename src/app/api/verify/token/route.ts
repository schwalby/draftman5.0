import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const RATE_LIMIT_MAX       = 3               // max attempts per window

// POST /api/verify/token
// Called by the bot when a user runs /verify
// Returns a one-time URL to DM to the user
export async function POST(req: NextRequest) {
  // Authenticate the bot
  const secret = req.headers.get('x-bot-secret')
  if (secret !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { discord_id, discord_username } = body

  if (!discord_id || !discord_username) {
    return NextResponse.json({ error: 'Missing discord_id or discord_username' }, { status: 400 })
  }

  // Check if user is already verified
  const { data: existingUser } = await supabase
    .from('users')
    .select('steam_verified, steam_id, steam_name')
    .eq('discord_id', discord_id)
    .maybeSingle()

  if (existingUser?.steam_verified && existingUser?.steam_id) {
    return NextResponse.json({
      already_verified: true,
      steam_name: existingUser.steam_name,
    })
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  // Count tokens created for this discord_id in the last 10 minutes
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count, error: countErr } = await supabase
    .from('verify_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('discord_id', discord_id)
    .gte('created_at', windowStart)

  if (countErr) {
    console.error('[verify/token] Rate limit check failed:', countErr)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: `Too many verification attempts. Please wait 10 minutes and try again.` },
      { status: 429 }
    )
  }

  // Delete any existing unused tokens for this user
  await supabase
    .from('verify_tokens')
    .delete()
    .eq('discord_id', discord_id)
    .eq('used', false)

  // Generate a secure one-time token
  const token = crypto.randomBytes(32).toString('hex')
  const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min expiry

  const { error } = await supabase.from('verify_tokens').insert({
    discord_id,
    discord_username,
    token,
    expires_at,
  })

  if (error) {
    console.error('[verify/token] Failed to create token:', error)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }

  const base = process.env.NEXTAUTH_URL ?? 'https://draftman50-production.up.railway.app'
  const url = `${base}/verify?token=${token}`

  return NextResponse.json({ url, expires_in_minutes: 15 })
}
