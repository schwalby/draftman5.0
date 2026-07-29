import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (!session.user.isSuperUser && !session.user.isOrganizer)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('ktp_debug_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[ktp-debug] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch KTP debug log' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
