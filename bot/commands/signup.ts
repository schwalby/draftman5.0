import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
} from 'discord.js'
import {
  getUserByDiscordId,
  getOpenEvents,
  getSignupCount,
  createSignup,
  getUserSignups,
} from '../core/db'
import { CLASS_LABELS, CLASSES } from '../core/types'
import { classEmojis } from '../core/emojis'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function rows<T extends ButtonBuilder>(btns: T[], size = 5): ActionRowBuilder<T>[] {
  const result: ActionRowBuilder<T>[] = []
  for (let i = 0; i < btns.length; i += size)
    result.push(new ActionRowBuilder<T>().addComponents(...btns.slice(i, i + size)))
  return result
}

function classBtn(customId: string, cls: string, style: ButtonStyle = ButtonStyle.Secondary): ButtonBuilder {
  const btn = new ButtonBuilder().setCustomId(customId).setLabel(CLASS_LABELS[cls]).setStyle(style)
  if (classEmojis[cls]) btn.setEmoji({ id: classEmojis[cls], name: cls })
  return btn
}

export async function handleSignup(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) {
    await interaction.reply({
      content: `❌ No DRAFTMAN account found. Log in first, then run **/signup** again.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Log in to DRAFTMAN5.0').setStyle(ButtonStyle.Link).setURL(process.env.API_BASE_URL!)
      )],
    })
    return
  }
  if (!user.steam_id) {
    await interaction.reply({ content: '⚠️ You need to verify your Steam account before signing up. Run **/verify** first.' })
    return
  }
  const events = await getOpenEvents()
  const mySignups = await getUserSignups(user.id)
  const signedUpIds = new Set(mySignups.map((s: any) => s.event_id))
  const available = events.filter(e => ['published', 'scheduled'].includes(e.status) && !signedUpIds.has(e.id))
  if (available.length === 0) {
    await interaction.reply({ content: '📭 No events are open for signup right now. Check back soon!' })
    return
  }
  const btns = available.map(e =>
    new ButtonBuilder()
      .setCustomId(`signup:event:${e.id}`)
      .setLabel(e.name.length > 80 ? e.name.slice(0, 77) + '…' : e.name)
      .setStyle(ButtonStyle.Primary)
  )
  await interaction.reply({
    content: '🎮 **Sign up for a draft — choose an event:**',
    components: rows(btns),
  })
}

export async function handleSignupEventBtn(interaction: ButtonInteraction) {
  const eventId = interaction.customId.replace('signup:event:', '')
  const events = await getOpenEvents()
  const event = events.find(e => e.id === eventId)
  if (!event) { await interaction.update({ content: '❌ Event not found.', components: [] }); return }
  const signupCount = await getSignupCount(eventId)
  const btns = CLASSES.map(c => classBtn(`signup:class1:${eventId}:${c}`, c))
  btns.push(new ButtonBuilder().setCustomId('signup:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger))
  await interaction.update({
    content: `**${event.name}**\n👥 ${signupCount} / ${event.capacity} signed up\n\nPick your **primary class:**`,
    components: rows(btns),
  })
}

export async function handleSignupClass1Btn(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':')
  const eventId = parts[2]
  const class1 = parts[3]
  const events = await getOpenEvents()
  const event = events.find(e => e.id === eventId)
  if (!event) { await interaction.update({ content: '❌ Event not found.', components: [] }); return }
  const remaining = CLASSES.filter(c => c !== class1)
  const btns = remaining.map(c => classBtn(`signup:class2:${eventId}:${class1}:${c}`, c))
  btns.push(
    new ButtonBuilder()
      .setCustomId(`signup:confirm:${eventId}:${class1}`)
      .setLabel(`Just ${CLASS_LABELS[class1]}`)
      .setStyle(ButtonStyle.Success)
  )
  await interaction.update({
    content: `**${event.name}**\nPrimary: **${CLASS_LABELS[class1]}**\n\nAdd a second class, or go with just ${CLASS_LABELS[class1]}:`,
    components: rows(btns),
  })
}

export async function handleSignupClass2Btn(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':')
  await doSignup(interaction, parts[2], [parts[3], parts[4]])
}

export async function handleSignupConfirm(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':')
  await doSignup(interaction, parts[2], [parts[3]])
}

async function doSignup(interaction: ButtonInteraction, eventId: string, classes: string[]) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) { await interaction.update({ content: '❌ Account not found.', components: [] }); return }
  try {
    await createSignup(user.id, eventId, classes)
    const events = await getOpenEvents()
    const event = events.find(e => e.id === eventId)!
    const classLabel = classes.map(c => CLASS_LABELS[c]).join(' / ')
    const newCount = await getSignupCount(eventId)
    await interaction.update({
      content: `✅ You're signed up as **${classLabel}** for **${event.name}**!\nRun **/checkin** when the check-in window opens.`,
      components: [],
    })
    const embed = new EmbedBuilder()
      .setColor(0x23a55a)
      .setTitle(`✅  ${interaction.user.displayName} signed up`)
      .setDescription(`**${event.name}**\n🎯 Class: ${classLabel}\n👥 ${newCount} / ${event.capacity} signed up`)
    try { if (interaction.channel && 'send' in interaction.channel) await (interaction.channel as any).send({ embeds: [embed] }) } catch {}
  } catch (err: any) {
    await interaction.update({ content: `❌ Signup failed: ${err.message}`, components: [] })
  }
}
