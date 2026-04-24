import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('rules_sections')
    .select('*, rules_items(id, content, position)')
    .order('position', { ascending: true })
    .order('position', { referencedTable: 'rules_items', ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isOrganizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Get max position
  const { data: sections } = await supabaseAdmin
    .from('rules_sections')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)

  const nextPos = sections && sections.length > 0 ? sections[0].position + 1 : 0

  const { data, error } = await supabaseAdmin
    .from('rules_sections')
    .insert({ title: body.title || 'New Section', position: nextPos })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
