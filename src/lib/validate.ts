import { NextResponse } from 'next/server'

/**
 * Returns a 400 NextResponse if any required fields are missing or null,
 * otherwise returns null. Use at the top of route handlers:
 *
 *   const err = requireFields(body, ['user_id', 'team_id'])
 *   if (err) return err
 */
export function requireFields(
  body: Record<string, unknown>,
  fields: string[]
): NextResponse | null {
  const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '')
  if (missing.length === 0) return null
  return NextResponse.json(
    { error: `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` },
    { status: 400 }
  )
}
