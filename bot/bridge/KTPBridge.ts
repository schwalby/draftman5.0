import { Message } from 'discord.js'
import { supabase } from '../core/supabase'

// Parses KTP Score Bot result embeds and reports match results to the tournament API

interface ParsedResult {
  score1: number
  score2: number
  half1_team1?: number
  half1_team2?: number
  half2_team1?: number
  half2_team2?: number
}

function parseScores(text: string): ParsedResult | null {
  const mainMatch = text.match(/(\d+)\s*[:\-–]\s*(\d+)/)
  if (!mainMatch) return null

  const result: ParsedResult = {
    score1: parseInt(mainMatch[1]),
    score2: parseInt(mainMatch[2]),
  }

  const half1Match = text.match(/1st\s+Half[:\s]+(\d+)\s*[:\-–]\s*(\d+)/i)
  const half2Match = text.match(/2nd\s+Half[:\s]+(\d+)\s*[:\-–]\s*(\d+)/i)

  if (half1Match) { result.half1_team1 = parseInt(half1Match[1]); result.half1_team2 = parseInt(half1Match[2]) }
  if (half2Match) { result.half2_team1 = parseInt(half2Match[1]); result.half2_team2 = parseInt(half2Match[2]) }

  return result
}

export async function handleKTPMessage(message: Message) {
  if (message.embeds.length === 0) return

  for (const embed of message.embeds) {
    const fullText = [
      embed.title ?? '',
      embed.description ?? '',
      ...(embed.fields ?? []).map(f => `${f.name} ${f.value}`),
    ].join('\n')

    const scores = parseScores(fullText)
    if (!scores) continue

    // Find an active tournament match to report against
    // KTP embeds contain team names — match against active tournament matches
    const { data: matches } = await supabase
      .from('tournament_matches')
      .select('id, tournament_id, team1:teams!team1_id(name), team2:teams!team2_id(name)')
      .eq('status', 'pending')

    if (!matches?.length) continue

    // Try to find the right match by looking for team names in the embed text
    for (const match of matches as any[]) {
      const t1 = match.team1?.name?.toLowerCase() ?? ''
      const t2 = match.team2?.name?.toLowerCase() ?? ''
      if (fullText.toLowerCase().includes(t1) && fullText.toLowerCase().includes(t2)) {
        await supabase
          .from('tournament_matches')
          .update({
            score_team1: scores.score1,
            score_team2: scores.score2,
            half1_score_team1: scores.half1_team1 ?? null,
            half1_score_team2: scores.half1_team2 ?? null,
            half2_score_team1: scores.half2_team1 ?? null,
            half2_score_team2: scores.half2_team2 ?? null,
            status: 'awaiting_confirmation',
          })
          .eq('id', match.id)

        console.log(`[KTPBridge] Reported result for match ${match.id}: ${scores.score1}-${scores.score2}`)
        break
      }
    }
  }
}
