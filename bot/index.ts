import 'dotenv/config'
import { Events, Interaction, ButtonInteraction } from 'discord.js'
import { client } from './core/client'
import { classEmojis, resolveEmojis } from './core/emojis'
import {
  handleSignup, handleSignupEventBtn, handleSignupClass1Btn,
  handleSignupClass2Btn, handleSignupConfirm,
} from './commands/signup'
import { handleWithdraw, handleWithdrawSelect, handleWithdrawConfirm } from './commands/withdraw'
import { handleCheckin } from './commands/checkin'
import { handleStatus } from './commands/status'
import { handleVerify } from './commands/verify'
import { handleKTPMessage } from './bridge/KTPBridge'

const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID!
const GUILD_ID = process.env.GUILD_ID!

client.once(Events.ClientReady, async () => {
  console.log(`[DRAFTMAN5.0] Online as ${client.user?.tag}`)
  try {
    const guild = await client.guilds.fetch(GUILD_ID)
    const emojis = await guild.emojis.fetch()
    resolveEmojis(emojis)
  } catch (err) {
    console.warn('[emojis] Failed to fetch guild emojis:', err)
  }
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
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
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'withdraw:select') { await handleWithdrawSelect(interaction); return }
      return
    }
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction
      const id = btn.customId
      if (id.startsWith('signup:event:'))     { await handleSignupEventBtn(btn);  return }
      if (id.startsWith('signup:class1:'))    { await handleSignupClass1Btn(btn); return }
      if (id.startsWith('signup:class2:'))    { await handleSignupClass2Btn(btn); return }
      if (id.startsWith('signup:confirm:'))   { await handleSignupConfirm(btn);   return }
      if (id === 'signup:cancel')             { await btn.update({ content: 'Signup cancelled.', components: [] }); return }
      if (id.startsWith('withdraw:confirm:')) { await handleWithdrawConfirm(btn); return }
      if (id === 'withdraw:cancel')           { await btn.update({ content: 'Withdrawal cancelled.', components: [] }); return }
      return
    }
  } catch (err) {
    console.error('[InteractionCreate]', err)
    try {
      const msg = { content: '❌ Something went wrong. Try again.' }
      if ('replied' in interaction && ((interaction as any).replied || (interaction as any).deferred)) {
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
