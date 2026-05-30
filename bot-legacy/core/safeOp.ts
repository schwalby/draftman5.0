// ── Safe async operation wrapper ──────────────────────────────────────────────
// Preserved exactly from index.ts — no changes to logic
// Wraps any async Discord or Supabase call, logs on failure, returns null
export async function safeOp<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[bot] ${label}:`, err)
    return null
  }
}
