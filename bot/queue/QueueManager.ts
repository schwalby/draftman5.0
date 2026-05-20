import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, TextChannel, WebhookClient } from 'discord.js'
import { QueuePlayer } from '../core/types'
import { client } from '../core/client'
import { safeOp } from '../core/safeOp'
import { queueWebhook, webhookSend } from '../messaging/WebhookSender'
import { saveQueueMessageId } from '../config/ConfigManager'
import { persistPlayerJoin, persistPlayerLeave, clearPersistedQueue, loadQueueFromDB } from './queuePersistence'
import { getConfig } from '../config/ConfigManager'

// ── Queue state ───────────────────────────────────────────────────────────────
// QueueManager owns all queue state exclusively
let _queuePlayers:   QueuePlayer[]     = []
let _queueWaitlist:  QueuePlayer[]     = []
let _queueMessageId: string | null     = null
const _bannedPlayers = new Set<string>()

// ── Accessors ─────────────────────────────────────────────────────────────────
export function getQueue():       QueuePlayer[]     { return _queuePlayers }
export function getWaitlist():    QueuePlayer[]     { return _queueWaitlist }
export function getBanned():      Set<string>       { return _bannedPlayers }
export function getMessageId():   string | null     { return _queueMessageId }

export function setQueue(players: QueuePlayer[]):   void { _queuePlayers  = players }
export function setWaitlist(wl: QueuePlayer[]):     void { _queueWaitlist = wl }
export function setMessageId(id: string | null):    void { _queueMessageId = id }

// ── Queue embed builders ──────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export function buildQueueEmbed(apiBaseUrl: string): EmbedBuilder {
  const list = _queuePlayers.map(p => `<@${p.discordId}>`).join(' ')
  return new EmbedBuilder()
    .setTitle('12 Man Queue')
    .setDescription(`Queue ${_queuePlayers.length}/${getConfig().queue_size}${list ? `\n${list}` : ''}`)
    .setColor(0x5865F2)
}

export function buildQueueButtons(apiBaseUrl: string): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('queue_join').setLabel('Join Queue').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('queue_leave').setLabel('Leave Queue').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setLabel('Web Queue ↗').setStyle(ButtonStyle.Link).setURL(apiBaseUrl),
  )]
}

// ── updateQueueEmbed ──────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function updateQueueEmbed(
  guildId: string,
  queueChannelId: string,
  apiBaseUrl: string,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId)
  const channel = guild?.channels.cache.get(queueChannelId) as TextChannel
  if (!channel) return

  const embed   = buildQueueEmbed(apiBaseUrl)
  const buttons = buildQueueButtons(apiBaseUrl)

  if (queueWebhook) {
    if (_queueMessageId) {
      const edited = await safeOp(
        () => queueWebhook!.editMessage(_queueMessageId!, { embeds: [embed], components: buttons }),
        'edit queue embed via webhook',
      )
      if (edited) return
    }
    const msg = await webhookSend(queueWebhook, { embeds: [embed], components: buttons }, 'send queue embed via webhook')
    if (msg) {
      _queueMessageId = msg.id
      await saveQueueMessageId(msg.id, guildId)
    }
    return
  }

  // Fallback: bot message
  if (_queueMessageId) {
    const msg = await safeOp(() => channel.messages.fetch(_queueMessageId!), 'fetch queue embed')
    if (msg) { await safeOp(() => msg.edit({ embeds: [embed], components: buttons }), 'edit queue embed'); return }
  }
  const msg = await safeOp(() => channel.send({ embeds: [embed], components: buttons }), 'send queue embed')
  if (msg) {
    _queueMessageId = msg.id
    await saveQueueMessageId(msg.id, guildId)
  }
}

// ── requeueAll ────────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function requeueAll(
  players: QueuePlayer[],
  guildId: string,
  queueChannelId: string,
  apiBaseUrl: string,
): Promise<void> {
  const existing = new Set(_queuePlayers.map(p => p.discordId))
  const toAdd = players.filter(p => !p.fake && !existing.has(p.discordId) && !_bannedPlayers.has(p.discordId))
  _queuePlayers = [...toAdd, ..._queuePlayers].slice(0, getConfig().queue_size)
  for (const p of toAdd) await persistPlayerJoin(p)
  await updateQueueEmbed(guildId, queueChannelId, apiBaseUrl)
  console.log(`[12man] Re-queued ${toAdd.length} players`)
}

// ── init ──────────────────────────────────────────────────────────────────────
// Called on bot startup to restore queue state from DB
export async function initQueue(
  onMessageId: (id: string) => void,
): Promise<void> {
  _queuePlayers = await loadQueueFromDB()
  // queue message ID is loaded by ConfigManager via loadConfig callback
}

// ── clearQueue ────────────────────────────────────────────────────────────────
export async function clearQueue(): Promise<void> {
  _queuePlayers  = []
  _queueWaitlist = []
  await clearPersistedQueue()
}
