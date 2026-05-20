import { ActiveMatch } from '../core/types'
import { A, ansi } from '../messaging/ansi'
import { runVote, VoteConfig } from './VoteEngine'
import { getConfig } from '../config/ConfigManager'
import { client } from '../core/client'
import { safeOp } from '../core/safeOp'
import { TextChannel } from 'discord.js'

// ── Server vote ───────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes

export async function startServerVote(
  match: ActiveMatch,
  guildId: string,
  onNext: () => Promise<void>,
): Promise<void> {
  const cfg     = getConfig()
  const servers = cfg.server_locations

  const config: VoteConfig = {
    headerKey:    'serverLocation',
    embedTitle:   '🖥️ Server Location',
    embedColor:   0x5865F2,
    buttonPrefix: 'servervote',
    intervalKey:  'serverInterval',
    candidates:   servers,
    durationMs:   cfg.server_vote_seconds * 1000,

    getVotes:     (m) => m.serverVotes,
    getMsgId:     (m) => m.serverVoteMsgId,
    setMsgId:     (m, id) => { m.serverVoteMsgId = id },
    getListMsgId: (m) => m.serverVoteListMsgId,
    setListMsgId: (m, id) => { m.serverVoteListMsgId = id },
    getEndTime:   (m) => m.serverVoteEndTime,
    setEndTime:   (m, t) => { m.serverVoteEndTime = t },

    onResolve: async (m, votes) => {
      await resolveServerVote(m, servers, guildId, onNext)
    },
  }

  await runVote(match, config, guildId)
}

export async function resolveServerVote(
  match: ActiveMatch,
  servers: string[],
  guildId: string,
  onNext: () => Promise<void>,
): Promise<void> {
  const tally: Record<string, number> = {}
  for (const s of Object.values(match.serverVotes)) tally[s] = (tally[s] ?? 0) + 1

  const sorted   = [...servers].sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
  const topCount = tally[sorted[0]] ?? 0
  const tied     = sorted.filter(s => (tally[s] ?? 0) === topCount)
  const selected = tied[Math.floor(Math.random() * tied.length)]
  match.selectedServer = selected

  const votedIds   = Object.keys(match.serverVotes)
  const votedNames = votedIds.map(id => match.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean)
  const notVoted   = match.players.filter(p => !p.fake && !votedIds.includes(p.discordId)).map(p => p.discordUsername)

  const out = [
    `${A.bold}${A.cyan}🖥️ Server: ${selected}${A.reset}`,
    `${A.cyan}Voted:     ${votedNames.length ? votedNames.join(', ') : 'none'}${A.reset}`,
    notVoted.length ? `${A.white}Not voted: ${notVoted.join(', ')}${A.reset}` : '',
  ].filter(Boolean).join('\n')

  if (match.matchWebhook) {
    await safeOp(() => match.matchWebhook!.send({
      username: 'DRAFT MAN 5.0',
      avatarURL: client.user?.avatarURL() ?? undefined,
      content: ansi(out),
    }), 'send server result')
  } else {
    const guild = client.guilds.cache.get(guildId)
    const ch = guild?.channels.cache.get(match.textChannelId) as TextChannel
    await safeOp(() => ch.send({ content: ansi(out) }), 'send server result')
  }

  await onNext()
}
