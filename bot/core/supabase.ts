import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

// ── Supabase client singleton ─────────────────────────────────────────────────
// Preserved exactly from index.ts — no changes to configuration
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws as any },
})
