import {
  ChatInputCommandInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js'
import { getUserByDiscordId, getUserSignups, deleteSignup } from '../core/db'

export async function handleWithdraw(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) {
    await interaction.reply({ content: 'No DRAFTMAN account found.', ephemeral: true })
    return
  }

  const signups = await getUserSignups(user.id)
  const active = signups.filter(s => ['published', 'scheduled', 'active'].includes((s.event as any).status))

  if (active.length === 0) {
    await interaction.reply({ content: 'You have no active signups to withdraw from.', ephemeral: true })
    return
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('withdraw:select')
    .setPlaceholder('Choose a signup to withdraw…')
    .addOptions(active.map(s =>
      new StringSelectMenuOptionBuilder()
        .setLabel((s.event as any).name)
        .setDescription(`Class: ${(s.class as string[]).join(' / ')}`)
        .setValue(s.id)
    ))

  await interaction.reply({
    content: 'Your current signups:',
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  })

  const selectCollector = interaction.channel?.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: i => i.user.id === interaction.user.id && i.customId === 'withdraw:select',
    time: 120_000,
    max: 1,
  })

  selectCollector?.on('collect', async (sel: StringSelectMenuInteraction) => {
    const signupId = sel.values[0]
    const signup = active.find(s => s.id === signupId)!
    const eventName = (signup.event as any).name
    const classLabel = (signup.class as string[]).join(' / ')

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`withdraw:confirm:${signupId}`)
      .setLabel('Yes, Withdraw')
      .setStyle(ButtonStyle.Danger)

    const cancelBtn = new ButtonBuilder()
      .setCustomId('withdraw:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)

    await sel.update({
      content: `**Withdraw from ${eventName}?**\nYour signup as **${classLabel}** will be removed. This cannot be undone.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
    })

    const confirmCollector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: i => i.user.id === interaction.user.id &&
        (i.customId.startsWith('withdraw:confirm:') || i.customId === 'withdraw:cancel'),
      time: 60_000,
      max: 1,
    })

    confirmCollector?.on('collect', async (btn: ButtonInteraction) => {
      if (btn.customId === 'withdraw:cancel') {
        await btn.update({ content: 'Withdrawal cancelled.', components: [] })
        return
      }
      try {
        await deleteSignup(signupId)
        await btn.update({ content: `You've been withdrawn from **${eventName}**.`, components: [] })
      } catch (err: any) {
        await btn.update({ content: `Failed: ${err.message}`, components: [] })
      }
    })
  })
}
