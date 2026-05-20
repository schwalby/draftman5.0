import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js'
import { supabase } from '../core/supabase'

// ── sendVerifyLink ────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function sendVerifyLink(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  discordId: string,
  discordUsername: string,
  apiBaseUrl: string,
  botSecret: string,
  followUp = false,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/verify/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-bot-secret': botSecret },
    body: JSON.stringify({ discord_id: discordId, discord_username: discordUsername }),
  })
  if (!res.ok) {
    const msg = res.status === 429 ? '⏳ Too many attempts. Wait 10 minutes.' : '❌ Something went wrong. Try again.'
    if (followUp) await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    else await interaction.editReply({ content: msg })
    return
  }
  const data = await res.json() as { already_verified?: boolean; steam_name?: string; url?: string }
  if (data.already_verified) {
    const msg = `✅ Already verified — **${data.steam_name}** is linked.`
    if (followUp) await (interaction as ButtonInteraction).followUp({ content: msg, flags: 64 })
    else await interaction.editReply({ content: msg })
    return
  }
  const content = [
    `**DRAFT MAN 5.0 — Steam Verification**`, ``,
    `🔗 ${data.url}`, ``,
    `Your Steam profile must be **public** during verification.`,
  ].join('\n')
  if (followUp) await (interaction as ButtonInteraction).followUp({ content, flags: 64 })
  else await interaction.editReply({ content })
}

// ── handleVerify ──────────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function handleVerify(
  interaction: ChatInputCommandInteraction,
  apiBaseUrl: string,
  botSecret: string,
): Promise<void> {
  await interaction.deferReply({ flags: 64 })
  const { id: discordId, username: discordUsername } = interaction.user
  try {
    const { data: user } = await supabase.from('users').select('id').eq('discord_id', discordId).maybeSingle()
    if (!user) {
      const btn = new ButtonBuilder()
        .setCustomId(`verify_loggedin_${discordId}`)
        .setLabel("✓  I'm signed in — send me the link")
        .setStyle(ButtonStyle.Success)
      await interaction.editReply({
        content: [
          `**You need a DRAFTMAN5.0 account first.**`, ``,
          `🔗 ${apiBaseUrl}/api/auth/signin/discord`, ``,
          `Sign in with Discord, then click the button below.`,
        ].join('\n'),
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)],
      })
      return
    }
    await sendVerifyLink(interaction, discordId, discordUsername, apiBaseUrl, botSecret)
  } catch (err) {
    console.error('[bot] /verify error:', err)
    await interaction.editReply({ content: '❌ An error occurred. Try again.' })
  }
}

// ── handleVerifyLoggedIn ──────────────────────────────────────────────────────
export async function handleVerifyLoggedIn(
  interaction: ButtonInteraction,
  apiBaseUrl: string,
  botSecret: string,
): Promise<void> {
  await interaction.deferUpdate()
  const { data: u } = await supabase.from('users').select('id').eq('discord_id', interaction.user.id).maybeSingle()
  if (!u) {
    await interaction.followUp({
      content: [`❌ Can't find your account.`, `🔗 ${apiBaseUrl}/api/auth/signin/discord`, `Sign in, then try again.`].join('\n'),
      flags: 64,
    })
    return
  }
  await sendVerifyLink(interaction, interaction.user.id, interaction.user.username, apiBaseUrl, botSecret, true)
}
