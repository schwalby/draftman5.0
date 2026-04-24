import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer && !session?.user?.isSuperUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the last pick
  const { data: lastPick } = await supabaseAdmin
    .from('draft_picks')
    .select('id')
    .eq('event_id', params.id)
    .order('pick_number', { ascending: false })
    .limit(1)
    .single()

  if (!lastPick) return NextResponse.json({ error: 'No picks to undo' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('draft_picks')
    .delete()
    .eq('id', lastPick.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
