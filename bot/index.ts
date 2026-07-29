import 'dotenv/config'
import { Events, Interaction, ButtonInteraction, Message, PartialMessage, TextChannel } from 'discord.js'
import { client } from './core/client'
import { classEmojis, resolveEmojis } from './core/emojis'
import {
  handleSignup, handleSignupEventBtn, handleSignupClass1Btn,
  handleSignupClass2Btn, handleSignupConfirm,
  handleUpdateRole, handleUpdateRoleSelect, handleUpdateRoleClass1Btn,
  handleUpdateRoleClass2Btn, handleUpdateRoleConfirm,
} from './commands/signup'
import { handleWithdraw, handleWithdrawSelect, handleWithdrawConfirm } from './commands/withdraw'
import { handleDraftDay } from './commands/draftday'
import { handleCheckin, handleCheckinButton } from './commands/checkin'
import { handleStatus } from './commands/status'
import { handleVerify } from './commands/verify'
import { handleKTPMessage } from './bridge/KTPBridge'

const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID!
const GUILD_ID = process.env.GUILD_ID!

// Safety net for the MessageCreate/MessageUpdate listeners below: the gateway connection
// can drop for a few seconds (restart, reconnect, resume gap) and miss an edit event
// during that window. Re-scanning recent history is safe to repeat -- once a match is
// reported its tournament_matches row leaves 'pending', so handleKTPMessage just finds
// no candidate match on a re-scan instead of double-reporting.
const RECONCILE_INTERVAL_MS = 15 * 60 * 1000
const RECONCILE_MESSAGE_LIMIT = 50

async function reconcileResultsChannel() {
  try {
    const channel = await client.channels.fetch(RESULTS_CHANNEL_ID)
    if (!channel || !(channel instanceof TextChannel)) {
      console.warn('[reconcile] Results channel is not a text channel or could not be fetched')
      return
    }
    const batch = await channel.messages.fetch({ limit: RECONCILE_MESSAGE_LIMIT })
    let scanned = 0
    for (const message of batch.values()) {
      if (!message.author.bot) continue
      scanned++
      await handleKTPMessage(message)
    }
    console.log(`[reconcile] Re-scanned ${scanned} bot messages in results channel`)
  } catch (err) {
    console.error('[reconcile] Failed to re-scan results channel:', err)
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`[DRAFTMAN5.0] Online as ${client.user?.tag}`)
  try {
    if (!GUILD_ID) {
      console.warn('[emojis] GUILD_ID env var not set — skipping emoji fetch')
    } else {
      const guild = await client.guilds.fetch(GUILD_ID)
      if (!guild.emojis) {
        console.warn('[emojis] Guild fetched but emojis manager unavailable (partial guild object?)')
      } else {
        const emojis = await guild.emojis.fetch()
        resolveEmojis(emojis)
      }
    }
  } catch (err) {
    console.warn('[emojis] Failed to fetch guild emojis:', err)
  }

  void reconcileResultsChannel()
  setInterval(() => { void reconcileResultsChannel() }, RECONCILE_INTERVAL_MS)
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'draftday':   await handleDraftDay(interaction);   break
        case 'signup':     await handleSignup(interaction);     break
        case 'withdraw':   await handleWithdraw(interaction);   break
        case 'updaterole': await handleUpdateRole(interaction); break
        case 'checkin':    await handleCheckin(interaction);    break
        case 'status':     await handleStatus(interaction);     break
        case 'verify':     await handleVerify(interaction);     break
      }
      return
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'withdraw:select')   { await handleWithdrawSelect(interaction);   return }
      if (interaction.customId === 'updaterole:select') { await handleUpdateRoleSelect(interaction); return }
      return
    }
    if (interaction.isButton()) {
      const btn = interaction as ButtonInteraction
      const id = btn.customId
      if (id.startsWith('signup:event:'))          { await handleSignupEventBtn(btn);       return }
      if (id.startsWith('signup:class1:'))         { await handleSignupClass1Btn(btn);      return }
      if (id.startsWith('signup:class2:'))         { await handleSignupClass2Btn(btn);      return }
      if (id.startsWith('signup:confirm:'))        { await handleSignupConfirm(btn);        return }
      if (id === 'draftday:checkin')               { await handleCheckinButton(btn);                return }
      if (id === 'signup:cancel')                  { await btn.update({ content: 'Signup cancelled.', components: [] }); return }
      if (id.startsWith('withdraw:confirm:'))      { await handleWithdrawConfirm(btn);      return }
      if (id === 'withdraw:cancel')                { await btn.update({ content: 'Withdrawal cancelled.', components: [] }); return }
      if (id.startsWith('updaterole:class1:'))     { await handleUpdateRoleClass1Btn(btn);  return }
      if (id.startsWith('updaterole:class2:'))     { await handleUpdateRoleClass2Btn(btn);  return }
      if (id.startsWith('updaterole:confirm:'))    { await handleUpdateRoleConfirm(btn);    return }
      if (id === 'updaterole:cancel')              { await btn.update({ content: 'Update cancelled.', components: [] }); return }
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

async function processResultsMessage(message: Message | PartialMessage) {
  try {
    const full = message.partial ? await message.fetch() : message
    if (full.channelId !== RESULTS_CHANNEL_ID) return
    if (!full.author?.bot) return
    await handleKTPMessage(full)
  } catch (err) {
    console.error('[results channel] Failed to process message:', err)
  }
}

client.on(Events.MessageCreate, message => { void processResultsMessage(message) })

// KTP Score Bot edits its scoreboard message in place as the match progresses and only
// reaches "MATCH COMPLETE" via an edit, not a new message -- without this listener the
// bridge would only ever see the message's pre-completion state.
client.on(Events.MessageUpdate, (_oldMessage, newMessage) => { void processResultsMessage(newMessage) })

client.login(process.env.DISCORD_BOT_TOKEN)
