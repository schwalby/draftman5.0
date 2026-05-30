import {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js'
import { getUserByDiscordId, getUserSignups, deleteSignup } from '../core/db'

export async function handleWithdraw(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) { await interaction.reply({ content: 'No DRAFTMAN account found.', ephemeral: true }); return }

  const signups = await getUserSignups(user.id)
  const active = signups.filter((s: any) => ['published', 'scheduled', 'active'].includes(s.event?.status))

  if (active.length === 0) { await interaction.reply({ content: 'You have no active signups to withdraw from.', ephemeral: true }); return }

  const select = new StringSelectMenuBuilder()
    .setCustomId('withdraw:select')
    .setPlaceholder('Choose a signup to withdraw…')
    .addOptions(active.map((s: any) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(s.event.name)
        .setDescription(`Class: ${(s.class as string[]).join(' / ')}`)
        .setValue(s.id)
    ))

  await interaction.reply({
    content: 'Your current signups:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  })
}

export async function handleWithdrawSelect(interaction: StringSelectMenuInteraction) {
  const signupId = interaction.values[0]
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) { await interaction.update({ content: 'Account not found.', components: [] }); return }

  const signups = await getUserSignups(user.id)
  const signup = signups.find((s: any) => s.id === signupId) as any
  if (!signup) { await interaction.update({ content: 'Signup not found.', components: [] }); return }

  const classLabel = (signup.class as string[]).join(' / ')

  await interaction.update({
    content: `**Withdraw from ${signup.event.name}?**\nYour signup as **${classLabel}** will be removed. This cannot be undone.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`withdraw:confirm:${signupId}`).setLabel('Yes, Withdraw').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('withdraw:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )],
  })
}

export async function handleWithdrawConfirm(interaction: ButtonInteraction) {
  const signupId = interaction.customId.replace('withdraw:confirm:', '')
  try {
    await deleteSignup(signupId)
    await interaction.update({ content: 'You have been withdrawn.', components: [] })
  } catch (err: any) {
    await interaction.update({ content: `Failed: ${err.message}`, components: [] })
  }
}
