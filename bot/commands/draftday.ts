import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  GuildMember,
} from 'discord.js'
import { getOpenEvents, getTeamsForEvent, getTeamPlayers } from '../core/db'

export async function handleDraftDay(interaction: ChatInputCommandInteraction) {
  const ALLOWED_ROLES = ['Administrator', 'Mod', 'Community Manager', 'Draft Admin']
  const member = interaction.member as GuildMember | null
  const hasRole = member?.roles.cache.some(r => ALLOWED_ROLES.includes(r.name)) ?? false
  const isServerAdmin = interaction.memberPermissions?.has(8n) ?? false // Administrator permission bit
  if (!hasRole && !isServerAdmin) {
    await interaction.reply({ content: '❌ You need the **Draft Admin** role to use this command.', ephemeral: true })
    return
  }

  const sub = interaction.options.getSubcommand()
  if (sub === 'checkin')  await handleCheckinAnnounce(interaction)
  if (sub === 'channels') await handleCreateChannels(interaction)
}

async function getActiveEvent(interaction: ChatInputCommandInteraction) {
  const events = await getOpenEvents()
  const active = events.filter(e => ['published', 'scheduled', 'active'].includes(e.status))
  if (active.length === 0) {
    await interaction.editReply({ content: '❌ No active events found.' })
    return null
  }
  // Soonest event by starts_at (already ordered by getOpenEvents)
  return active[0]
}

// ── /draftday checkin ──────────────────────────────────────────────────────

async function handleCheckinAnnounce(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true })

  const event = await getActiveEvent(interaction)
  if (!event) return

  const eventUrl = `${process.env.API_BASE_URL}/events/${event.id}`

  const embed = new EmbedBuilder()
    .setColor(0x23a55a)
    .setTitle(`✅  Check-in is open — ${event.name}`)
    .setDescription(`Draft day is here. Check in to confirm your spot in the draft.\n\nRun **/checkin** in Discord or click the button below.`)
    .setURL(eventUrl)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Check In')
      .setStyle(ButtonStyle.Link)
      .setURL(eventUrl)
  )

  try {
    if (interaction.channel && 'send' in interaction.channel) {
      await (interaction.channel as any).send({ embeds: [embed], components: [row] })
    }
    await interaction.editReply({ content: `✅ Check-in announcement posted for **${event.name}**.` })
  } catch (err: any) {
    await interaction.editReply({ content: `❌ Failed to post announcement: ${err.message}` })
  }
}

// ── /draftday channels ─────────────────────────────────────────────────────

async function handleCreateChannels(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true })

  const guild = interaction.guild
  if (!guild) {
    await interaction.editReply({ content: '❌ Must be run in a server.' })
    return
  }

  const event = await getActiveEvent(interaction)
  if (!event) return

  const teams = await getTeamsForEvent(event.id)
  if (teams.length === 0) {
    await interaction.editReply({ content: `❌ No teams found for **${event.name}**. Has the draft happened yet?` })
    return
  }

  // Find the existing draft category (e.g. "NEXT DRAFT - ??/??/2026")
  const category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toUpperCase().includes('DRAFT')
  )
  if (!category) {
    await interaction.editReply({ content: '❌ No category containing "DRAFT" found in this server. Create the draft category first.' })
    return
  }

  const lines: string[] = []

  for (const team of teams) {
    let vc
    try {
      vc = await guild.channels.create({
        name: team.name,
        type: ChannelType.GuildVoice,
        parent: category.id,
        reason: `Draft day — ${event.name}`,
      })
    } catch (err: any) {
      lines.push(`❌ **${team.name}** — failed to create channel: ${err.message}`)
      continue
    }

    const players = await getTeamPlayers(team.id)
    let moved = 0, waiting = 0

    for (const player of players) {
      if (!player.discord_id) { waiting++; continue }
      try {
        const member = await guild.members.fetch(player.discord_id)
        if (member.voice.channel) {
          await member.voice.setChannel(vc)
          moved++
        } else {
          waiting++
        }
      } catch {
        waiting++
      }
    }

    const status = moved > 0
      ? `${moved} moved in · ${waiting} need to join`
      : `${waiting} need to join`
    lines.push(`${vc} **${team.name}** — ${status}`)
  }

  // Public announcement
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎙️ Team channels are up — ${event.name}`)
    .setDescription(lines.join('\n'))

  try {
    if (interaction.channel && 'send' in interaction.channel) {
      await (interaction.channel as any).send({ embeds: [embed] })
    }
  } catch {}

  await interaction.editReply({ content: `✅ ${teams.length} channels created under **${event.name}**.` })
}
