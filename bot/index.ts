import 'dotenv/config'
import { Events, Interaction } from 'discord.js'
import { client } from './core/client'
import { handleSignup } from './commands/signup'
import { handleWithdraw } from './commands/withdraw'
import { handleCheckin } from './commands/checkin'
import { handleStatus } from './commands/status'
import { handleVerify } from './commands/verify'
import { handleKTPMessage } from './bridge/KTPBridge'

const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID!

client.once(Events.ClientReady, () => {
  console.log(`[DRAFTMAN5.0] Online as ${client.user?.tag}`)
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return

  try {
    switch (interaction.commandName) {
      case 'signup':   await handleSignup(interaction);   break
      case 'withdraw': await handleWithdraw(interaction); break
      case 'checkin':  await handleCheckin(interaction);  break
      case 'status':   await handleStatus(interaction);   break
      case 'verify':   await handleVerify(interaction);   break
    }
  } catch (err) {
    console.error(`[${interaction.commandName}]`, err)
    const msg = { content: 'Something went wrong. Try again.', ephemeral: true }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg)
    } else {
      await interaction.reply(msg)
    }
  }
})

// KTP Score Bot bridge
client.on(Events.MessageCreate, async message => {
  if (message.channelId !== RESULTS_CHANNEL_ID) return
  if (!message.author.bot) return
  await handleKTPMessage(message)
})

client.login(process.env.DISCORD_BOT_TOKEN)
