import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getPublicBase(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) return `${proto}://${host}`
  return process.env.NEXTAUTH_URL ?? 'https://draftman50-production.up.railway.app'
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/verify/start
// Web-initiated Steam verification. Creates a one-time token from the user's
// session and redirects straight to the Steam OpenID login page.
export async function GET(req: NextRequest) {
  const base = getPublicBase(req)
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.redirect(new URL('/', base))
  }

  const discordId = (session.user as any).discordId as string | undefined
  const discordUsername = session.user.discordUsername ?? session.user.name ?? 'unknown'

  if (!discordId) {
    return NextResponse.redirect(new URL(\1, base))
  }

  // Already verified — no need to go through the flow again
  const { data: existingUser } = await supabase
    .from('users')
    .select('steam_verified, steam_id')
    .eq('discord_id', discordId)
    .maybeSingle()

  if (existingUser?.steam_verified && existingUser?.steam_id) {
    return NextResponse.redirect(new URL(\1, base))
  }

  // Delete any existing unused tokens for this user
  await supabase
    .from('verify_tokens')
    .delete()
    .eq('discord_id', discordId)
    .eq('used', false)

  // Generate a new one-time token (15 min expiry, same as bot flow)
  const token = crypto.randomBytes(32).toString('hex')
  const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  const { error } = await supabase.from('verify_tokens').insert({
    discord_id: discordId,
    discord_username: discordUsername,
    token,
    expires_at,
  })

  if (error) {
    console.error('[verify/start] Failed to create token:', error)
    return NextResponse.redirect(new URL(\1, base))
  }

  const base = getPublicBase(req)
  return NextResponse.redirect(`${base}/api/verify/steam?token=${token}`)
}
