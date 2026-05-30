import { WebhookClient, TextChannel } from 'discord.js'
import { client } from '../core/client'
import { safeOp } from '../core/safeOp'

// ── Queue channel webhook (permanent) ────────────────────────────────────────
// Created manually in Discord, URL stored in QUEUE_WEBHOOK_URL env var
export const queueWebhook = process.env.QUEUE_WEBHOOK_URL
  ? new WebhookClient({ url: process.env.QUEUE_WEBHOOK_URL })
  : null

// ── Webhook identity ──────────────────────────────────────────────────────────
// Preserved exactly from index.ts
export function botWebhookOptions() {
  return {
    username: 'DRAFT MAN 5.0',
    avatarURL: client.user?.avatarURL() ?? undefined,
  }
}

// ── Generic webhook send ──────────────────────────────────────────────────────
// Preserved exactly from index.ts
export async function webhookSend(
  webhook: WebhookClient,
  payload: Parameters<WebhookClient['send']>[0],
  label: string,
) {
  return safeOp(() => webhook.send({ ...botWebhookOptions(), ...(payload as object) }), label)
}

// ── Match channel send ────────────────────────────────────────────────────────
// Routes to match webhook if available, falls back to bot channel send
// Preserved exactly from index.ts — activeMatch passed as parameter
// to avoid circular dependency with match state
export async function matchSend(
  payload: Parameters<WebhookClient['send']>[0],
  label: string,
  matchWebhook: WebhookClient | undefined,
  textChannelId: string,
  guildId: string,
) {
  if (matchWebhook) {
    return webhookSend(matchWebhook, payload, label)
  }
  const guild = client.guilds.cache.get(guildId)
  const ch = guild?.channels.cache.get(textChannelId) as TextChannel
  return safeOp(() => ch.send(payload as any), label)
}
