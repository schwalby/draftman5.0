import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { getUserByDiscordId, getUserSignups } from '../core/db'

export async function handleStatus(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) {
    await interaction.reply({
      content: `No DRAFTMAN account found. Log in at ${process.env.API_BASE_URL}`,
      ephemeral: true,
    })
    return
  }

  const signups = await getUserSignups(user.id)
  const active = signups.filter(s => ['published', 'scheduled', 'active'].includes((s.event as any).status))

  const embed = new EmbedBuilder()
    .setColor(0xc8b87a)
    .setTitle('Your status')

  if (active.length === 0) {
    embed.setDescription('No active signups.')
  } else {
    for (const s of active) {
      const event = s.event as any
      const classLabel = (s.class as string[]).join(' / ')
      const checkinStatus = s.checked_in
        ? '✓ Checked in'
        : event.checkin_opens_at && new Date(event.checkin_opens_at) <= new Date()
          ? '⚠ Check-in open — run /checkin!'
          : 'Check-in not open yet'

      embed.addFields({ name: event.name, value: `${classLabel}  ·  ${checkinStatus}`, inline: false })
    }
  }

  const steamStatus = user.steam_verified
    ? `${user.steam_name ?? user.steam_id}  ·  ✓ Verified`
    : user.steam_id ? 'Steam ID set but not verified' : 'No Steam ID — run /verify'

  embed.setFooter({ text: `Steam: ${steamStatus}` })

  await interaction.reply({ embeds: [embed], ephemeral: true })
}
