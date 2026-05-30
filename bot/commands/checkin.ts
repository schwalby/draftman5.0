import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { getUserByDiscordId, getUserSignups, getSignupCount, checkIn } from '../core/db'

export async function handleCheckin(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) {
    await interaction.reply({ content: 'No DRAFTMAN account found.', ephemeral: true })
    return
  }

  const signups = await getUserSignups(user.id)
  const now = new Date()

  // Find signups where check-in window is open and not yet checked in
  const eligible = signups.filter(s => {
    const event = s.event as any
    if (s.checked_in) return false
    if (!['published', 'scheduled', 'active'].includes(event.status)) return false
    if (!event.checkin_opens_at) return false
    return new Date(event.checkin_opens_at) <= now
  })

  // Find signups where check-in hasn't opened yet (for helpful error)
  const notYetOpen = signups.filter(s => {
    const event = s.event as any
    if (s.checked_in) return false
    if (!['published', 'scheduled'].includes(event.status)) return false
    if (!event.checkin_opens_at) return false
    return new Date(event.checkin_opens_at) > now
  })

  if (eligible.length === 0) {
    if (notYetOpen.length > 0) {
      const next = notYetOpen[0]
      const event = next.event as any
      const opensAt = new Date(event.checkin_opens_at).toLocaleString('en-US', {
        hour: 'numeric', minute: '2-digit', weekday: 'short', month: 'short', day: 'numeric',
      })
      await interaction.reply({
        content: `Check-in for **${event.name}** opens at **${opensAt}**.`,
        ephemeral: true,
      })
    } else {
      await interaction.reply({ content: 'No check-in windows are open for your signups right now.', ephemeral: true })
    }
    return
  }

  // Check in to all eligible (usually just one)
  for (const signup of eligible) {
    await checkIn(signup.id)
  }

  const event = eligible[0].event as any
  const checkinCount = await getSignupCount(event.id) // approximate

  const embed = new EmbedBuilder()
    .setColor(0x23a55a)
    .setTitle(`✓ ${interaction.user.displayName} checked in`)
    .setDescription(`**${event.name}**\n${checkinCount} / ${event.capacity} checked in`)

  await interaction.reply({ content: `✅ You're checked in for **${event.name}**!`, ephemeral: true })
  try { if (interaction.channel && 'send' in interaction.channel) await (interaction.channel as any).send({ embeds: [embed] }) } catch {}
}
