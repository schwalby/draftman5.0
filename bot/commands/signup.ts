import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
  TextChannel,
} from 'discord.js'
import {
  getUserByDiscordId,
  getOpenEvents,
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

// Chunk array into rows of N
function rows<T extends ButtonBuilder>(btns: T[], size = 5): ActionRowBuilder<T>[] {
  const result: ActionRowBuilder<T>[] = []
  for (let i = 0; i < btns.length; i += size) {
    result.push(new ActionRowBuilder<T>().addComponents(...btns.slice(i, i + size)))
  }
  return result
}

// Step 1 — /signup
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
    await interaction.reply({ content: 'Verify your Steam account first — run /verify.' })
    return
  }

  const events = await getOpenEvents()
  const mySignups = await getUserSignups(user.id)
  const signedUpIds = new Set(mySignups.map((s: any) => s.event_id))
  const available = events.filter(e => ['published', 'scheduled'].includes(e.status) && !signedUpIds.has(e.id))

  if (available.length === 0) {
    await interaction.reply({ content: 'No events are open for signup right now.' })
    return
  }

  const btns = available.map(e =>
    new ButtonBuilder()
      .setCustomId(`signup:event:${e.id}`)
      .setLabel(e.name.length > 80 ? e.name.slice(0, 77) + '…' : e.name)
      .setStyle(ButtonStyle.Primary)
  )

  await interaction.reply({
    content: '**Sign up — choose an event:**',
    components: rows(btns),
  })
}

// Step 2 — event chosen, pick primary class
export async function handleSignupEventBtn(interaction: ButtonInteraction) {
  const eventId = interaction.customId.replace('signup:event:', '')
  const events = await getOpenEvents()
  const event = events.find(e => e.id === eventId)
  if (!event) { await interaction.update({ content: 'Event not found.', components: [] }); return }

  const signupCount = await getSignupCount(eventId)

  const btns = CLASSES.map(c =>
    new ButtonBuilder()
      .setCustomId(`signup:class1:${eventId}:${c}`)
      .setLabel(CLASS_LABELS[c])
      .setStyle(ButtonStyle.Secondary)
  )
  btns.push(
    new ButtonBuilder().setCustomId('signup:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
  )

  await interaction.update({
    content: `**${event.name}** · ${signupCount}/${event.capacity} signed up\nPick your **primary class:**`,
    components: rows(btns),
  })
}

// Step 3 — primary class chosen, pick secondary or skip
export async function handleSignupClass1Btn(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':') // signup:class1:eventId:class
  const eventId = parts[2]
  const class1 = parts[3]
  const events = await getOpenEvents()
  const event = events.find(e => e.id === eventId)
  if (!event) { await interaction.update({ content: 'Event not found.', components: [] }); return }

  const remaining = CLASSES.filter(c => c !== class1)
  const btns = remaining.map(c =>
    new ButtonBuilder()
      .setCustomId(`signup:class2:${eventId}:${class1}:${c}`)
      .setLabel(CLASS_LABELS[c])
      .setStyle(ButtonStyle.Secondary)
  )
  btns.push(
    new ButtonBuilder()
      .setCustomId(`signup:confirm:${eventId}:${class1}`)
      .setLabel(`Just ${CLASS_LABELS[class1]}`)
      .setStyle(ButtonStyle.Success)
  )

  await interaction.update({
    content: `**${event.name}**\nPrimary: **${CLASS_LABELS[class1]}**\nAdd a second class, or confirm:`,
    components: rows(btns),
  })
}

// Step 4a — second class chosen
export async function handleSignupClass2Btn(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':') // signup:class2:eventId:class1:class2
  const eventId = parts[2]
  const class1 = parts[3]
  const class2 = parts[4]
  await doSignup(interaction, eventId, [class1, class2])
}

// Step 4b — confirm single class
export async function handleSignupConfirm(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':') // signup:confirm:eventId:class1
  const eventId = parts[2]
  const class1 = parts[3]
  await doSignup(interaction, eventId, [class1])
}

async function doSignup(interaction: ButtonInteraction, eventId: string, classes: string[]) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) { await interaction.update({ content: 'Account not found.', components: [] }); return }
  try {
    await createSignup(user.id, eventId, classes)
    const events = await getOpenEvents()
    const event = events.find(e => e.id === eventId)!
    const classLabel = classes.map(c => CLASS_LABELS[c]).join(' / ')
    const newCount = await getSignupCount(eventId)

    await interaction.update({ content: `✓ Signed up as **${classLabel}** for **${event.name}**!`, components: [] })

    const embed = new EmbedBuilder()
      .setColor(0x23a55a)
      .setTitle(`✓ ${interaction.user.displayName} signed up`)
      .setDescription(`**${event.name}**\nClass: ${classLabel}\n${newCount} / ${event.capacity} signed up`)

    if (interaction.channel instanceof TextChannel) await interaction.channel.send({ embeds: [embed] })
  } catch (err: any) {
    await interaction.update({ content: `Failed: ${err.message}`, components: [] })
  }
}
