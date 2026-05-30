import {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js'
import {
  getUserByDiscordId,
  getOpenEvents,
  getClassCounts,
  getSignupCount,
  createSignup,
  getUserSignups,
} from '../core/db'
import { CLASS_LABELS, CLASSES, DbEvent } from '../core/types'

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
      content: `No DRAFTMAN account found. Log in first at ${process.env.API_BASE_URL}, then run \`/signup\` again.`,
      ephemeral: true,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Log in to DRAFTMAN5.0').setStyle(ButtonStyle.Link).setURL(process.env.API_BASE_URL!)
      )],
    })
    return
  }

  if (!user.steam_id) {
    await interaction.reply({
      content: `You need to verify your Steam account before signing up. Run \`/verify\` first.`,
      ephemeral: true,
    })
    return
  }

  const events = await getOpenEvents()
  const signableEvents = events.filter(e => e.status === 'published' || e.status === 'scheduled')

  if (signableEvents.length === 0) {
    await interaction.reply({ content: 'No events are open for signup right now.', ephemeral: true })
    return
  }

  // Check existing signups to exclude events already signed up for
  const mySignups = await getUserSignups(user.id)
  const signedUpEventIds = new Set(mySignups.map(s => s.event_id))

  const availableEvents = signableEvents.filter(e => !signedUpEventIds.has(e.id))

  if (availableEvents.length === 0) {
    await interaction.reply({ content: 'You\'re already signed up for all open events.', ephemeral: true })
    return
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('signup:event')
    .setPlaceholder('Choose an event…')
    .addOptions(availableEvents.map(e =>
      new StringSelectMenuOptionBuilder()
        .setLabel(e.name)
        .setDescription(formatDate(e.starts_at))
        .setValue(e.id)
    ))

  await interaction.reply({
    content: 'Choose an event to sign up for:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  })

  // Wait for event selection
  const eventCollector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: i => i.user.id === interaction.user.id && i.customId === 'signup:event',
    time: 120_000,
    max: 1,
  })

  eventCollector?.on('collect', async (eventSel: StringSelectMenuInteraction) => {
    const eventId = eventSel.values[0]
    const event = availableEvents.find(e => e.id === eventId)!
    await showClassStep(eventSel, user.id, event)
  })
}

async function showClassStep(
  interaction: StringSelectMenuInteraction,
  userId: string,
  event: DbEvent,
) {
  const counts = await getClassCounts(event.id)
  const signupCount = await getSignupCount(event.id)

  const classLines = CLASSES.map(c =>
    `${CLASS_LABELS[c]}: ${counts[c] ?? 0} signed`
  ).join('  ·  ')

  const classSelect = new StringSelectMenuBuilder()
    .setCustomId(`signup:class:${event.id}`)
    .setPlaceholder('Pick your class(es) — max 2')
    .setMinValues(1)
    .setMaxValues(2)
    .addOptions(CLASSES.map(c =>
      new StringSelectMenuOptionBuilder()
        .setLabel(CLASS_LABELS[c])
        .setDescription(`${counts[c] ?? 0} signed`)
        .setValue(c)
    ))

  await interaction.update({
    content: `**${event.name}** — pick your class(es). Max 2.\n\`${classLines}\`\n${signupCount} / ${event.capacity} signed up`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(classSelect)],
  })

  const classCollector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: i => i.user.id === interaction.user.id && i.customId === `signup:class:${event.id}`,
    time: 120_000,
    max: 1,
  })

  classCollector?.on('collect', async (classSel: StringSelectMenuInteraction) => {
    const classes = classSel.values
    await showConfirmStep(classSel, userId, event, classes)
  })
}

async function showConfirmStep(
  interaction: StringSelectMenuInteraction,
  userId: string,
  event: DbEvent,
  classes: string[],
) {
  const classLabel = classes.map(c => CLASS_LABELS[c]).join(' / ')

  const confirmBtn = new ButtonBuilder()
    .setCustomId(`signup:confirm:${event.id}:${classes.join(',')}`)
    .setLabel('Confirm Sign Up')
    .setStyle(ButtonStyle.Success)

  const backBtn = new ButtonBuilder()
    .setCustomId('signup:back')
    .setLabel('← Back')
    .setStyle(ButtonStyle.Secondary)

  await interaction.update({
    content: `**${event.name}**\nClass: **${classLabel}**\n\nReady to sign up?`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, backBtn)],
  })

  const confirmCollector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === interaction.user.id &&
      (i.customId.startsWith('signup:confirm:') || i.customId === 'signup:back'),
    time: 120_000,
    max: 1,
  })

  confirmCollector?.on('collect', async (btn: ButtonInteraction) => {
    if (btn.customId === 'signup:back') {
      await btn.update({ content: 'Signup cancelled.', components: [] })
      return
    }

    const parts = btn.customId.split(':') // signup:confirm:eventId:classes
    const eventId = parts[2]
    const chosenClasses = parts[3].split(',')

    try {
      await createSignup(userId, eventId, chosenClasses)
      const classLabel = chosenClasses.map(c => CLASS_LABELS[c]).join(' / ')
      const newCount = await getSignupCount(eventId)

      // Update ephemeral
      await btn.update({
        content: `You're in! ✓ Run \`/checkin\` when the check-in window opens.`,
        components: [],
      })

      // Post public confirmation
      const embed = new EmbedBuilder()
        .setColor(0x23a55a)
        .setTitle(`✓ ${interaction.user.displayName} signed up`)
        .setDescription(`**${event.name}**\nClass: ${classLabel}\n${newCount} / ${event.capacity} signed up`)

      if (btn.channel && 'send' in btn.channel) await btn.channel.send({ embeds: [embed] })

    } catch (err: any) {
      await btn.update({ content: `Failed to sign up: ${err.message}`, components: [] })
    }
  })
}
