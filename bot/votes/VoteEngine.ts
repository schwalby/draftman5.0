import { EmbedBuilder, WebhookClient, TextChannel } from 'discord.js'
import { ActiveMatch, TimerKey } from '../core/types'
import { client } from '../core/client'
import { safeOp } from '../core/safeOp'
import { A, ansi, timeLeft, voteList } from '../messaging/ansi'
import { buttonRows } from '../messaging/embeds'
import { getHeader } from '../messaging/headers'
import { getConfig } from '../config/ConfigManager'

// ── Vote config ───────────────────────────────────────────────────────────────
// Each vote type provides this config to VoteEngine.runVote()
export interface VoteConfig {
  // Identity
  headerKey: Parameters<typeof getHeader>[0]
  embedTitle: string
  embedColor: number
  buttonPrefix: string
  intervalKey: TimerKey

  // Candidates — labels shown in vote list and on buttons
  candidates: string[]

  // Duration in ms
  durationMs: number

  // Where votes are stored on the match object
  getVotes: (match: ActiveMatch) => Record<string, string>

  // Message ID storage
  getMsgId:     (match: ActiveMatch) => string | undefined
  setMsgId:     (match: ActiveMatch, id: string) => void
  getListMsgId: (match: ActiveMatch) => string | undefined
  setListMsgId: (match: ActiveMatch, id: string) => void
  getEndTime:   (match: ActiveMatch) => number
  setEndTime:   (match: ActiveMatch, time: number) => void

  // Called when vote resolves
  onResolve: (match: ActiveMatch, votes: Record<string, string>) => Promise<void>
}

// ── Generic send helper ───────────────────────────────────────────────────────
async function sendToMatch(
  match: ActiveMatch,
  payload: any,
  label: string,
  guildId: string,
) {
  if (match.matchWebhook) {
    return safeOp(() => match.matchWebhook!.send({
      username: 'DRAFT MAN 5.0',
      avatarURL: client.user?.avatarURL() ?? undefined,
      ...payload,
    }), label)
  }
  const guild = client.guilds.cache.get(guildId)
  const ch = guild?.channels.cache.get(match.textChannelId) as TextChannel
  return safeOp(() => ch.send(payload), label)
}

// ── editMatchMessage ──────────────────────────────────────────────────────────
// Updates a message posted by the match webhook or bot
export async function editMatchMessage(
  match: ActiveMatch,
  msgId: string,
  payload: any,
  label: string,
  guildId: string,
) {
  if (match.matchWebhook) {
    await safeOp(() => match.matchWebhook!.editMessage(msgId, payload), label)
  } else {
    const guild = client.guilds.cache.get(guildId)
    const ch = guild?.channels.cache.get(match.textChannelId) as TextChannel
    const m = await safeOp(() => ch.messages.fetch(msgId), `fetch ${label}`)
    if (m) await safeOp(() => m.edit(payload), label)
  }
}

// ── tallyVotes ────────────────────────────────────────────────────────────────
// Generic tally — supports comma-separated multi-votes (captain) and single votes
export function tallyVotes(votes: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const v of Object.values(votes)) {
    for (const val of v.split(',').filter(Boolean)) {
      counts[val] = (counts[val] ?? 0) + 1
    }
  }
  return counts
}

// ── randomTiebreak ────────────────────────────────────────────────────────────
export function randomTiebreak<T>(items: T[], score: (item: T) => number): T {
  const max = Math.max(...items.map(score))
  const tied = items.filter(item => score(item) === max)
  return tied[Math.floor(Math.random() * tied.length)]
}

// ── runVote ───────────────────────────────────────────────────────────────────
// Generic vote runner — handles all three vote types
export async function runVote(
  match: ActiveMatch,
  config: VoteConfig,
  guildId: string,
): Promise<void> {
  const end = Date.now() + config.durationMs
  config.setEndTime(match, end)

  const cfg = getConfig()

  const buildEmbed = () => new EmbedBuilder()
    .setTitle(config.embedTitle)
    .setDescription(`Vote closes in **${timeLeft(end)}**`)
    .setColor(config.embedColor)

  const buildList = () => ansi(voteList(config.candidates, config.getVotes(match), true))

  // Send header, list, and embed with buttons
  await sendToMatch(match, { content: getHeader(config.headerKey, cfg.header_style) }, `send ${config.headerKey} header`, guildId)
  const listMsg = await sendToMatch(match, { content: buildList() }, `send ${config.headerKey} list`, guildId)
  const voteMsg = await sendToMatch(match, {
    embeds: [buildEmbed()],
    components: buttonRows(config.candidates.map((c, i) => `${i + 1}) ${c}`), config.buttonPrefix),
  }, `send ${config.headerKey} vote`, guildId)

  if (voteMsg?.id) config.setMsgId(match, voteMsg.id)
  if (listMsg?.id) config.setListMsgId(match, listMsg.id)

  // Countdown interval — stored in timers Map for safe cleanup
  const interval = setInterval(async () => {
    const msgId     = config.getMsgId(match)
    const listMsgId = config.getListMsgId(match)
    if (!msgId) { clearTimeout(match.timers.get(config.intervalKey)!); match.timers.delete(config.intervalKey); return }
    if (msgId)     await editMatchMessage(match, msgId,     { embeds: [buildEmbed()] }, `update ${config.headerKey} timer`, guildId)
    if (listMsgId) await editMatchMessage(match, listMsgId, { content: buildList() },   `update ${config.headerKey} list`,  guildId)
  }, 30000)

  // Store interval handle in timers Map so cleanupMatch() always clears it
  match.timers.set(config.intervalKey, interval as unknown as ReturnType<typeof setTimeout>)

  // Resolution timer
  const t = match.timers.get('vote')
  if (t) { clearTimeout(t); match.timers.delete('vote') }
  match.timers.set('vote', setTimeout(async () => {
    clearTimeout(match.timers.get(config.intervalKey)!)
    match.timers.delete(config.intervalKey)
    await config.onResolve(match, config.getVotes(match))
  }, config.durationMs))
}
