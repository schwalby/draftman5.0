import { supabase } from '../core/supabase'

// ── Match persistence ─────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes

// Loads the highest match_number from DB so counter never reuses numbers
// Returns the counter value so caller can set their local state
export async function loadMatchCounter(): Promise<number> {
  const { data } = await supabase
    .from('twelve_man_matches')
    .select('match_number')
    .order('match_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data?.match_number) {
    console.log(`[12man] Match counter restored to ${data.match_number}`)
    return data.match_number
  }

  return 0
}
