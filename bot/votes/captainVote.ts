import { ActiveMatch, QueuePlayer } from '../core/types'
import { A, ansi } from '../messaging/ansi'
import { isOnCooldown, setCooldown } from '../cooldowns/cooldowns'
import { runVote, tallyVotes, randomTiebreak, VoteConfig } from './VoteEngine'
import { getConfig } from '../config/ConfigManager'
import { client } from '../core/client'
import { safeOp } from '../core/safeOp'
import { TextChannel } from 'discord.js'
import { matchSend } from '../match/MatchManager'

// ── Captain vote ──────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes

export async function startCaptainVote(
  match: ActiveMatch,
  guildId: string,
  onNext: () => Promise<void>,
): Promise<void> {
  // Build eligible candidate list (skip cooldown players, include fake players)
  const eligible: QueuePlayer[] = []
  for (const p of match.players) {
    if (p.fake) { eligible.push(p); continue }
    if (!await isOnCooldown(p.discordId)) eligible.push(p)
  }
  match.captainCandidates = eligible

  const config: VoteConfig = {
    headerKey:    'captainVote',
    embedTitle:   '⚔️ Vote for Captains',
    embedColor:   0xF0B132,
    buttonPrefix: 'captvote',
    intervalKey:  'captainInterval',
    candidates:   eligible.map(p => p.discordUsername),
    durationMs:   getConfig().captain_vote_seconds * 1000,

    getVotes:     (m) => m.captainVotes,
    getMsgId:     (m) => m.captainVoteMsgId,
    setMsgId:     (m, id) => { m.captainVoteMsgId = id },
    getListMsgId: (m) => m.captainVoteListMsgId,
    setListMsgId: (m, id) => { m.captainVoteListMsgId = id },
    getEndTime:   (m) => m.captainVoteEndTime,
    setEndTime:   (m, t) => { m.captainVoteEndTime = t },

    onResolve: async (m, votes) => {
      await resolveCaptainVote(m, eligible, guildId, onNext)
    },
  }

  await runVote(match, config, guildId)
}

export async function resolveCaptainVote(
  match: ActiveMatch,
  eligible: QueuePlayer[],
  guildId: string,
  onNext: () => Promise<void>,
): Promise<void> {
  // Tally — captain votes are comma-separated (2 votes per player)
  const tally: Record<string, number> = {}
  for (const voteStr of Object.values(match.captainVotes)) {
    for (const id of voteStr.split(',').filter(Boolean)) {
      tally[id] = (tally[id] ?? 0) + 1
    }
  }

  const sorted = [...eligible].sort((a, b) => (tally[b.discordId] ?? 0) - (tally[a.discordId] ?? 0))
  const top = sorted[0]
  let second = sorted[1]

  // Tiebreak for second place
  if (sorted.length > 2 && (tally[sorted[1]?.discordId] ?? 0) === (tally[sorted[2]?.discordId] ?? 0)) {
    const tied = sorted.filter(p => (tally[p.discordId] ?? 0) === (tally[sorted[1].discordId] ?? 0))
    second = tied[Math.floor(Math.random() * tied.length)]
  }

  match.captainA = top
  match.captainB = second

  const votedIds     = Object.keys(match.captainVotes).filter(id => match.captainVotes[id].length > 0)
  const votedNames   = votedIds.map(id => match.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean)
  const notVoted     = match.players.filter(p => !p.fake && !votedIds.includes(p.discordId)).map(p => p.discordUsername)

  const out = [
    `${A.bold}${A.yellow}⚔️ Captains Selected!${A.reset}`,
    ``,
    `${A.green}Allies: ${top.discordUsername}${A.reset}`,
    `${A.red}Axis:   ${second.discordUsername}${A.reset}`,
    ``,
    `${A.cyan}Voted:     ${votedNames.length ? votedNames.join(', ') : 'none'}${A.reset}`,
    notVoted.length ? `${A.white}Not voted: ${notVoted.join(', ')}${A.reset}` : '',
  ].filter(Boolean).join('\n')

  // Send result via matchSend
  await matchSend(match, { content: ansi(out) }, 'send captain result', guildId)

  if (!top.fake)    await setCooldown(top.discordId, top.discordUsername)
  if (!second.fake) await setCooldown(second.discordId, second.discordUsername)

  await onNext()
}
