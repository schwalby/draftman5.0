// ── Rate limiter ──────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
const _cooldowns = new Map<string, number>()
const COOLDOWN_MS = 800

export function isRateLimited(userId: string): boolean {
  const last = _cooldowns.get(userId) ?? 0
  if (Date.now() - last < COOLDOWN_MS) return true
  _cooldowns.set(userId, Date.now())
  return false
}
