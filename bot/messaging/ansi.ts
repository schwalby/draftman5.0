// ── ANSI color codes ──────────────────────────────────────────────────────────
export const A = {
  reset:  '\u001b[0m',
  green:  '\u001b[2;32m',
  red:    '\u001b[2;31m',
  yellow: '\u001b[2;33m',
  cyan:   '\u001b[2;36m',
  white:  '\u001b[2;37m',
  bold:   '\u001b[1m',
  purple: '\u001b[2;35m',
  coral:  '\u001b[1;31m',
  gold:   '\u001b[1;33m',
  teal:   '\u001b[1;36m',
}

// Wrap text in an ANSI Discord code block
export const ansi = (text: string) => `\`\`\`ansi\n${text}\n\`\`\``

// Format seconds remaining into human-readable countdown
export const timeLeft = (endTime: number): string => {
  const s = Math.max(0, Math.ceil((endTime - Date.now()) / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

// Format a vote list in ANSI with optional winner highlighting
// Preserved exactly from index.ts — no changes to logic
export function voteList(items: string[], votes: Record<string, string>, highlight = false): string {
  const counts: Record<string, number> = {}
  for (const v of Object.values(votes)) counts[v] = (counts[v] ?? 0) + 1
  const max = Math.max(0, ...Object.values(counts))

  const lines = items.map((item, i) => {
    const n = counts[item] ?? 0
    const color = (highlight && n === max && n > 0) ? A.yellow : A.white
    return `${color}${String(i + 1).padStart(2)}) ${item.padEnd(22)} Votes: ${n}${A.reset}`
  })

  if (items.length <= 5) return lines.join('\n')
  const mid = Math.ceil(lines.length / 2)
  return lines.slice(0, mid).map((l, i) => lines[mid + i] ? `${l}   ${lines[mid + i]}` : l).join('\n')
}
