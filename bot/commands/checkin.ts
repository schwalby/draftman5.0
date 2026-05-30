import { ChatInputCommandInteraction, ButtonInteraction, EmbedBuilder } from 'discord.js'
import { getUserByDiscordId, getUserSignups, getSignupCount, checkIn } from '../core/db'

// Shared logic used by both /checkin and the draftday check-in button
export async function performCheckin(
  interaction: ChatInputCommandInteraction | ButtonInteraction
) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) {
    await interaction.reply({ content: 'No DRAFTMAN account found.', ephemeral: true })
    return
  }

  const signups = await getUserSignups(user.id)
  const now = new Date()

  const eligible = signups.filter(s => {
    const event = s.event as any
    if (s.checked_in) return false
    if (!['published', 'scheduled', 'active'].includes(event.status)) return false
    if (!event.checkin_opens_at) return false
    return new Date(event.checkin_opens_at) <= now
  })

  const notYetOpen = signups.filter(s => {
    const event = s.event as any
    if (s.checked_in) return false
    if (!['published', 'scheduled'].includes(event.status)) return false
    if (!event.checkin_opens_at) return false
    return new Date(event.checkin_opens_at) > now
  })

  if (eligible.length === 0) {
    if (notYetOpen.length > 0) {
      const event = notYetOpen[0].event as any
      const opensAt = new Date(event.checkin_opens_at).toLocaleString('en-US', {
        hour: 'numeric', minute: '2-digit', weekday: 'short', month: 'short', day: 'numeric',
      })
      await interaction.reply({ content: `Check-in for **${event.name}** opens at **${opensAt}**.`, ephemeral: true })
    } else {
      await interaction.reply({ content: 'No check-in windows are open for your signups right now.', ephemeral: true })
    }
    return
  }

  for (const signup of eligible) {
    await checkIn(signup.id)
  }

  const event = eligible[0].event as any
  const checkinCount = await getSignupCount(event.id)
  const eventUrl = `${process.env.API_BASE_URL}/events/${event.id}`

  const embed = new EmbedBuilder()
    .setColor(0x23a55a)
    .setTitle(`✓ ${interaction.user.displayName} checked in`)
    .setURL(eventUrl)
    .setDescription(`**${event.name}**\n${checkinCount} / ${event.capacity} checked in`)

  await interaction.reply({ content: `✅ You're checked in for [${event.name}](${eventUrl})!`, ephemeral: true })
  try { if (interaction.channel && 'send' in interaction.channel) await (interaction.channel as any).send({ embeds: [embed] }) } catch {}
}

export async function handleCheckin(interaction: ChatInputCommandInteraction) {
  await performCheckin(interaction)
}

export async function handleCheckinButton(interaction: ButtonInteraction) {
  await performCheckin(interaction)
}
