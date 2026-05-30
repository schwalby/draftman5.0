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
    .setPlaceholder('Choose one or more signups to withdraw…')
    .setMinValues(1)
    .setMaxValues(active.length)
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
  const selectedIds = interaction.values
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) { await interaction.update({ content: 'Account not found.', components: [] }); return }

  const signups = await getUserSignups(user.id)
  const selected = selectedIds.map(id => signups.find((s: any) => s.id === id)).filter(Boolean) as any[]
  if (selected.length === 0) { await interaction.update({ content: 'Signup not found.', components: [] }); return }

  if (selected.length === 1) {
    const signup = selected[0]
    const classLabel = (signup.class as string[]).join(' / ')
    await interaction.update({
      content: `**Withdraw from ${signup.event.name}?**\nYour signup as **${classLabel}** will be removed. This cannot be undone.`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`withdraw:confirm:${signup.id}`).setLabel('Yes, Withdraw').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('withdraw:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      )],
    })
  } else {
    // Multiple: process immediately — multi-select + submit is deliberate enough
    const eventList = selected.map(s => `• **${s.event.name}**`).join('\n')
    try {
      await Promise.all(selected.map(s => deleteSignup(s.id)))
      await interaction.update({ content: `✅ Withdrawn from ${selected.length} events:\n${eventList}`, components: [] })
      for (const signup of selected) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle(`↩️  ${interaction.user.displayName} withdrew`)
          .setURL(`${process.env.API_BASE_URL}/events/${signup.event.id}`)
          .setDescription(`**${signup.event.name}**`)
        try { if (interaction.channel && 'send' in interaction.channel) await (interaction.channel as any).send({ embeds: [embed] }) } catch {}
      }
    } catch (err: any) {
      await interaction.update({ content: `❌ Failed: ${err.message}`, components: [] })
    }
  }
}

export async function handleWithdrawConfirm(interaction: ButtonInteraction) {
  const signupId = interaction.customId.replace('withdraw:confirm:', '')
  const user = await getUserByDiscordId(interaction.user.id)
  if (!user) { await interaction.update({ content: '❌ Account not found.', components: [] }); return }
  const signups = await getUserSignups(user.id)
  const signup = signups.find((s: any) => s.id === signupId) as any
  try {
    await deleteSignup(signupId)
    await interaction.update({ content: '✅ You have been withdrawn.', components: [] })
    if (signup) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`↩️  ${interaction.user.displayName} withdrew`)
        .setURL(`${process.env.API_BASE_URL}/events/${signup.event.id}`)
        .setDescription(`**${signup.event.name}**`)
      try { if (interaction.channel && 'send' in interaction.channel) await (interaction.channel as any).send({ embeds: [embed] }) } catch {}
    }
  } catch (err: any) {
    await interaction.update({ content: `❌ Failed: ${err.message}`, components: [] })
  }
}
