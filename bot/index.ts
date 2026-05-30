import 'dotenv/config'
import { Events, Interaction, StringSelectMenuInteraction, ButtonInteraction } from 'discord.js'
import { client } from './core/client'
import { handleSignup, handleSignupEventSelect, handleSignupClassSelect, handleSignupConfirm } from './commands/signup'
import { handleWithdraw, handleWithdrawSelect, handleWithdrawConfirm } from './commands/withdraw'
import { handleCheckin } from './commands/checkin'
import { handleStatus } from './commands/status'
import { handleVerify } from './commands/verify'
import { handleKTPMessage } from './bridge/KTPBridge'

const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID!

client.once(Events.ClientReady, () => {
  console.log(`[DRAFTMAN5.0] Online as ${client.user?.tag}`)
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'signup':   await handleSignup(interaction);   break
        case 'withdraw': await handleWithdraw(interaction); break
        case 'checkin':  await handleCheckin(interaction);  break
        case 'status':   await handleStatus(interaction);   break
        case 'verify':   await handleVerify(interaction);   break
      }
      return
    }

    // Select menus
    if (interaction.isStringSelectMenu()) {
      const sel = interaction as StringSelectMenuInteraction
      if (sel.customId === 'signup:event') { await handleSignupEventSelect(sel); return }
      if (sel.customId.startsWith('signup:class:')) { await handleSignupClassSelect(sel); return }
      if (sel.customId === 'withdraw:select') { await handleWithdrawSelect(sel); return }
      return
    }

    // Buttons
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction
      if (btn.customId.startsWith('signup:confirm:')) { await handleSignupConfirm(btn); return }
      if (btn.customId === 'signup:cancel') { await btn.update({ content: 'Signup cancelled.', components: [] }); return }
      if (btn.customId.startsWith('withdraw:confirm:')) { await handleWithdrawConfirm(btn); return }
      if (btn.customId === 'withdraw:cancel') { await btn.update({ content: 'Withdrawal cancelled.', components: [] }); return }
      return
    }

  } catch (err) {
    console.error('[InteractionCreate]', err)
    try {
      const msg = { content: 'Something went wrong. Try again.' }
      if ('replied' in interaction && (interaction.replied || interaction.deferred)) {
        await (interaction as any).followUp(msg)
      } else if ('reply' in interaction) {
        await (interaction as any).reply(msg)
      }
    } catch {}
  }
})

client.on(Events.MessageCreate, async message => {
  if (message.channelId !== RESULTS_CHANNEL_ID) return
  if (!message.author.bot) return
  await handleKTPMessage(message)
})

client.login(process.env.DISCORD_BOT_TOKEN)
