import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  const { data: items } = await supabaseAdmin
    .from('rules_items')
    .select('position')
    .eq('section_id', params.id)
    .order('position', { ascending: false })
    .limit(1)

  const nextPos = items && items.length > 0 ? items[0].position + 1 : 0

  const { data, error } = await supabaseAdmin
    .from('rules_items')
    .insert({ section_id: params.id, content: body.content || '', position: nextPos })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
