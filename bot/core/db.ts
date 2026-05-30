import { supabase } from './supabase'
import { DbUser, DbEvent, DbSignup } from './types'

export async function getUserByDiscordId(discordId: string): Promise<DbUser | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('discord_id', discordId)
    .maybeSingle()
  return data ?? null
}

export async function getOpenEvents(): Promise<DbEvent[]> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .in('status', ['published', 'scheduled', 'active'])
    .order('starts_at', { ascending: true })
  return data ?? []
}

export async function getUserSignups(userId: string): Promise<(DbSignup & { event: DbEvent })[]> {
  const { data } = await supabase
    .from('signups')
    .select('*, event:events(*)')
    .eq('user_id', userId)
    .neq('status', 'withdrawn')
  return (data ?? []) as any
}

export async function getSignupCount(eventId: string): Promise<number> {
  const { count } = await supabase
    .from('signups')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .neq('status', 'withdrawn')
  return count ?? 0
}

export async function getClassCounts(eventId: string): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('signups')
    .select('class')
    .eq('event_id', eventId)
    .neq('status', 'withdrawn')

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    for (const cls of row.class as string[]) {
      counts[cls] = (counts[cls] ?? 0) + 1
    }
  }
  return counts
}

export async function createSignup(
  userId: string,
  eventId: string,
  classes: string[]
): Promise<DbSignup> {
  // Calculate priority (next available slot)
  const count = await getSignupCount(eventId)
  const { data, error } = await supabase
    .from('signups')
    .insert({ event_id: eventId, user_id: userId, class: classes, status: 'confirmed', priority: count + 1 })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteSignup(signupId: string): Promise<void> {
  const { error } = await supabase.from('signups').delete().eq('id', signupId)
  if (error) throw new Error(error.message)
}

export async function updateSignupClass(signupId: string, classes: string[]): Promise<void> {
  const { error } = await supabase.from('signups').update({ class: classes }).eq('id', signupId)
  if (error) throw new Error(error.message)
}

export async function checkIn(signupId: string): Promise<void> {
  const { error } = await supabase
    .from('signups')
    .update({ checked_in: true })
    .eq('id', signupId)
  if (error) throw new Error(error.message)
}

export async function getVerifyToken(userId: string): Promise<string> {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('verify_tokens')
    .insert({ token, user_id: userId, expires_at: expiresAt })
  if (error) throw new Error(error.message)
  return token
}
