import {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuInteraction,
  ButtonInteraction,
  TextChannel,
} from 'discord.js'
import {
  getUserByDiscordId,
  getOpenEvents,
  getClassCounts,
  getSignupCount,
  createSignup,
  getUserSignups,
} from '../core/db'
import { CLASS_LABELS, CLASSES } from '../core/types'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export async function handleSignup(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) {
    await interaction.reply({
      content: `No DRAFTMAN account found. Log in first at ${process.env.API_BASE_URL}, then run /signup again.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Log in to DRAFTMAN5.0').setStyle(ButtonStyle.Link).setURL(process.env.API_BASE_URL!)
      )],
      
    })
    return
  }
  if (!user.steam_id) {
    await interaction.reply({ content: 'Verify your Steam account first — run /verify.',  })
    return
  }
  const events = await getOpenEvents()
  const mySignups = await getUserSignups(user.id)
  const signedUpIds = new Set(mySignups.map((s: any) => s.event_id))
  const available = events.filter(e => ['published', 'scheduled'].includes(e.status) && !signedUpIds.has(e.id))
  if (available.length === 0) {
    await interaction.reply({ content: 'No events are open for signup right now.',  })
    return
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId('signup:event')
    .setPlaceholder('Choose an event…')
    .addOptions(available.map(e =>
      new StringSelectMenuOptionBuilder().setLabel(e.name).setDescription(formatDate(e.starts_at)).setValue(e.id)
    ))
  await interaction.reply({
    content: 'Choose an event to sign up for:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    
  })
}

export async function handleSignupEventSelect(interaction: StringSelectMenuInteraction) {
  const eventId = interaction.values[0]
  const events = await getOpenEvents()
  const event = events.find(e => e.id === eventId)
  if (!event) { await interaction.update({ content: 'Event not found.', components: [] }); return }
  const counts = await getClassCounts(eventId)
  const signupCount = await getSignupCount(eventId)
  const select = new StringSelectMenuBuilder()
    .setCustomId(`signup:class:${eventId}`)
    .setPlaceholder('Pick your class(es) — max 2')
    .setMinValues(1).setMaxValues(2)
    .addOptions(CLASSES.map(c =>
      new StringSelectMenuOptionBuilder().setLabel(CLASS_LABELS[c]).setDescription(`${counts[c] ?? 0} signed`).setValue(c)
    ))
  const classLines = CLASSES.map(c => `${CLASS_LABELS[c]}: ${counts[c] ?? 0}`).join('  ·  ')
  await interaction.update({
    content: `**${event.name}** — pick your class(es). Max 2.\n\`${classLines}\`\n${signupCount} / ${event.capacity} signed up`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  })
}

export async function handleSignupClassSelect(interaction: StringSelectMenuInteraction) {
  const eventId = interaction.customId.replace('signup:class:', '')
  const classes = interaction.values
  const events = await getOpenEvents()
  const event = events.find(e => e.id === eventId)
  if (!event) { await interaction.update({ content: 'Event not found.', components: [] }); return }
  const classLabel = classes.map(c => CLASS_LABELS[c]).join(' / ')
  await interaction.update({
    content: `**${event.name}**\nClass: **${classLabel}**\n\nReady to sign up?`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`signup:confirm:${eventId}:${classes.join(',')}`).setLabel('Confirm Sign Up').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('signup:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )],
  })
}

export async function handleSignupConfirm(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':')
  const eventId = parts[2]
  const classes = parts[3].split(',')
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) { await interaction.update({ content: 'Account not found.', components: [] }); return }
  try {
    await createSignup(user.id, eventId, classes)
    const events = await getOpenEvents()
    const event = events.find(e => e.id === eventId)!
    const classLabel = classes.map(c => CLASS_LABELS[c]).join(' / ')
    const newCount = await getSignupCount(eventId)
    await interaction.update({ content: `You're in! ✓ Run /checkin when the check-in window opens.`, components: [] })
    const embed = new EmbedBuilder()
      .setColor(0x23a55a)
      .setTitle(`✓ ${interaction.user.displayName} signed up`)
      .setDescription(`**${event.name}**\nClass: ${classLabel}\n${newCount} / ${event.capacity} signed up`)
    if (interaction.channel instanceof TextChannel) await interaction.channel.send({ embeds: [embed] })
  } catch (err: any) {
    await interaction.update({ content: `Failed: ${err.message}`, components: [] })
  }
}
