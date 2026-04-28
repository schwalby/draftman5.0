import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side: uses anon key, respects RLS
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side only: creates a fresh client per call to avoid stale connections
export function getSupabaseAdmin() {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// Backwards compat singleton
export const supabaseAdmin = typeof window === 'undefined'
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null as any