import { ActiveMatch } from '../core/types'
import { A, ansi } from '../messaging/ansi'
import { runVote, VoteConfig } from './VoteEngine'
import { getConfig, getMapPool } from '../config/ConfigManager'
import { client } from '../core/client'
import { safeOp } from '../core/safeOp'
import { TextChannel } from 'discord.js'

// ── Map vote ──────────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes

export async function startMapVote(
  match: ActiveMatch,
  guildId: string,
  onNext: () => Promise<void>,
  onSkip: (reason: string) => Promise<void>,
): Promise<void> {
  const pool = await getMapPool(guildId)
  if (!pool.length) {
    await onSkip('TBD')
    return
  }

  const cfg   = getConfig()
  const count = cfg.map_count > 0 ? cfg.map_count : pool.length
  const maps  = [...pool].sort(() => Math.random() - 0.5).slice(0, count)
  match.mapOptions = maps

  const config: VoteConfig = {
    headerKey:    'mapSelection',
    embedColor:   0x2D7D46,
    buttonPrefix: 'mapvote',
    intervalKey:  'mapInterval',
    candidates:   maps,
    durationMs:   cfg.map_vote_seconds * 1000,

    getVotes:     (m) => m.mapVotes,
    getMsgId:     (m) => m.mapVoteMsgId,
    setMsgId:     (m, id) => { m.mapVoteMsgId = id },
    getListMsgId: (m) => m.mapVoteListMsgId,
    setListMsgId: (m, id) => { m.mapVoteListMsgId = id },
    getEndTime:   (m) => m.mapVoteEndTime,
    setEndTime:   (m, t) => { m.mapVoteEndTime = t },

    onResolve: async (m, votes) => {
      await resolveMapVote(m, maps, guildId, onNext)
    },
  }

  await runVote(match, config, guildId)
}

export async function resolveMapVote(
  match: ActiveMatch,
  maps: string[],
  guildId: string,
  onNext: () => Promise<void>,
): Promise<void> {
  const tally: Record<string, number> = {}
  for (const m of Object.values(match.mapVotes)) tally[m] = (tally[m] ?? 0) + 1

  const sorted   = [...maps].sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
  const topCount = tally[sorted[0]] ?? 0
  const tied     = sorted.filter(m => (tally[m] ?? 0) === topCount)
  const selected = tied[Math.floor(Math.random() * tied.length)]
  match.selectedMap = selected

  const votedIds   = Object.keys(match.mapVotes)
  const votedNames = votedIds.map(id => match.players.find(p => p.discordId === id)?.discordUsername).filter(Boolean)
  const notVoted   = match.players.filter(p => !p.fake && !votedIds.includes(p.discordId)).map(p => p.discordUsername)

  const out = [
    `${A.bold}${A.green}🗺️ Map: ${selected}${A.reset}`,
    `${A.cyan}Voted:     ${votedNames.length ? votedNames.join(', ') : 'none'}${A.reset}`,
    notVoted.length ? `${A.white}Not voted: ${notVoted.join(', ')}${A.reset}` : '',
  ].filter(Boolean).join('\n')

  if (match.matchWebhook) {
    await safeOp(() => match.matchWebhook!.send({
      username: 'DRAFT MAN 5.0',
      avatarURL: client.user?.avatarURL() ?? undefined,
      content: ansi(out),
    }), 'send map result')
  } else {
    const guild = client.guilds.cache.get(guildId)
    const ch = guild?.channels.cache.get(match.textChannelId) as TextChannel
    await safeOp(() => ch.send({ content: ansi(out) }), 'send map result')
  }

  await onNext()
}
