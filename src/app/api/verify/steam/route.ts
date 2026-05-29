import { NextRequest, NextResponse } from 'next/server'

function getPublicBase(req: NextRequest): string {
  // Railway (and most reverse proxies) forward the original host via headers.
  // req.url gives the internal address (localhost:3000), so we must use headers.
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (host) return `${proto}://${host}`
  // Last resort: env var or hardcoded production URL
  return process.env.NEXTAUTH_URL ?? 'https://draftman50-production.up.railway.app'
}

// GET /api/verify/steam?token=xxx
// Redirects the user to Steam's OpenID login page
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/verify?error=missing_token', req.url))
  }

  const base = getPublicBase(req)
  const returnTo = `${base}/api/verify/callback?token=${token}`

  // Steam OpenID 2.0 parameters
  const params = new URLSearchParams({
    'openid.ns':         'http://specs.openid.net/auth/2.0',
    'openid.mode':       'checkid_setup',
    'openid.return_to':  returnTo,
    'openid.realm':      base,
    'openid.identity':   'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  })

  return NextResponse.redirect(
    `https://steamcommunity.com/openid/login?${params.toString()}`
  )
}
