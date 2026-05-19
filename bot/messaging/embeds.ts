import {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js'

// ── Button row builder ────────────────────────────────────────────────────────
// Pure function — no state, no side effects
// Preserved exactly from index.ts — no changes to logic
export function buttonRows(
  labels: string[],
  prefix: string,
  style = ButtonStyle.Secondary,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  let row = new ActionRowBuilder<ButtonBuilder>()
  let n = 0
  for (let i = 0; i < labels.length && i < 25; i++) {
    if (n === 5) { rows.push(row); row = new ActionRowBuilder<ButtonBuilder>(); n = 0 }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}_${i}`)
        .setLabel(labels[i])
        .setStyle(style),
    )
    n++
  }
  if (n > 0) rows.push(row)
  return rows
}
