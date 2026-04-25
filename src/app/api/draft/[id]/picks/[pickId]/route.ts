import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; pickId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !(session?.user as any)?.isSuperUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { pickId } = params
  const body = await req.json()
  const allowed = ['class']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  const { error } = await supabaseAdmin
    .from('draft_picks')
    .update(updates)
    .eq('id', pickId)

  if (error) {
    console.error('PATCH draft pick error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
