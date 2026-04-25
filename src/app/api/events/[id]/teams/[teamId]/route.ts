import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; teamId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !(session?.user as any)?.isSuperUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const allowed = ['name', 'custom_name', 'color', 'captain_id', 'pick_order']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .update(updates)
    .eq('id', params.teamId)
    .eq('event_id', params.id)
    .select()
    .single()

  if (error) {
    console.error('PATCH team error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
