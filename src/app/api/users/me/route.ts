import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { toSteamId64, validateSteamId64 } from '@/lib/steam'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('users')
    .select('id, ingame_name, is_organizer, is_superuser, steam_id, steam_id_64, steam_name, steam_avatar')
    .eq('id', session.user.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const allowed: Record<string, unknown> = {}

  if ('steam_id' in body) {
    const raw = (body.steam_id ?? '').toString().trim()

    if (!raw) {
      allowed.steam_id = null
      allowed.steam_id_64 = null
      allowed.steam_name = null
      allowed.steam_avatar = null
    } else {
      const id64 = toSteamId64(raw)
      if (!id64) {
        return NextResponse.json(
          { error: 'Invalid Steam ID format. Use STEAM_0:0:XXXXXXX or your 17-digit SteamID64.' },
          { status: 400 }
        )
      }

      const player = await validateSteamId64(id64)
      if (!player) {
        return NextResponse.json(
          { error: 'Steam account not found. Double-check your Steam ID.' },
          { status: 400 }
        )
      }

      allowed.steam_id = raw
      allowed.steam_id_64 = id64
      allowed.steam_name = player.personaname || null
      allowed.steam_avatar = player.avatarfull || null
    }
  }

  if ('ingame_name' in body) {
    allowed.ingame_name = body.ingame_name ?? null
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('users')
    .update(allowed)
    .eq('id', session.user.userId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'That Steam ID is already registered to another account.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}