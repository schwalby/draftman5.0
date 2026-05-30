import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { getUserByDiscordId, getVerifyToken } from '../core/db'

export async function handleVerify(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id)

  if (!user) {
    await interaction.reply({
      content: 'No DRAFTMAN account found. Log in first, then run `/verify` again.',
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Log in to DRAFTMAN5.0')
          .setStyle(ButtonStyle.Link)
          .setURL(process.env.API_BASE_URL!)
      )],
      ephemeral: true,
    })
    return
  }

  if (user.steam_verified) {
    await interaction.reply({
      content: `✓ Already verified — your Steam account **${user.steam_name ?? user.steam_id}** is linked. You're good to sign up for drafts.`,
      ephemeral: true,
    })
    return
  }

  const token = await getVerifyToken(user.id)
  const verifyUrl = `${process.env.API_BASE_URL}/verify?token=${token}`

  await interaction.reply({
    content: 'Click below to link your Steam account. Link expires in 10 minutes.',
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('🔗 Verify with Steam')
        .setStyle(ButtonStyle.Link)
        .setURL(verifyUrl)
    )],
    ephemeral: true,
  })
}
