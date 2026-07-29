import 'dotenv/config'
import { Client, Collection, GatewayIntentBits, Message, Partials, TextChannel } from 'discord.js'
import { handleKTPMessage } from '../bridge/KTPBridge'

// One-off backfill: page through RESULTS_CHANNEL_ID history for a given UTC calendar day
// and run every message through the same handleKTPMessage pipeline the live bot uses.
// Fetches current (already-edited) message state via REST, so the MessageUpdate gap that
// affected live processing doesn't apply here -- each message is read in its final form.
//
// Usage: npx ts-node scripts/backfill-ktp.ts YYYY-MM-DD

const RESULTS_CHANNEL_ID = process.env.RESULTS_CHANNEL_ID!
const TARGET_DATE = process.argv[2]

async function main() {
  if (!TARGET_DATE || !/^\d{4}-\d{2}-\d{2}$/.test(TARGET_DATE)) {
    console.error('Usage: npx ts-node scripts/backfill-ktp.ts YYYY-MM-DD')
    process.exit(1)
  }

  const dayStart = new Date(`${TARGET_DATE}T00:00:00.000Z`)
  const dayEnd = new Date(`${TARGET_DATE}T23:59:59.999Z`)

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Message, Partials.Channel],
  })

  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => resolve())
    client.login(process.env.DISCORD_BOT_TOKEN).catch(reject)
  })
  console.log(`Logged in as ${client.user?.tag}`)

  const channel = await client.channels.fetch(RESULTS_CHANNEL_ID)
  if (!channel || !(channel instanceof TextChannel)) {
    console.error(`Channel ${RESULTS_CHANNEL_ID} is not a text channel or could not be fetched`)
    await client.destroy()
    process.exit(1)
  }

  let before: string | undefined = undefined
  let scanned = 0
  let inRange = 0
  let processed = 0

  outer: while (true) {
    const batch: Collection<string, Message> = await channel.messages.fetch({ limit: 100, before })
    if (batch.size === 0) break

    for (const message of batch.values()) {
      scanned++
      if (message.createdAt < dayStart) break outer // paged past the target day

      if (message.createdAt <= dayEnd && message.author.bot) {
        inRange++
        await handleKTPMessage(message)
        processed++
      }
    }
    before = batch.last()?.id
  }

  console.log(`Scanned ${scanned} messages, ${inRange} bot messages on ${TARGET_DATE}, ran ${processed} through handleKTPMessage.`)
  console.log('Check /admin/ktp-debug for results.')
  await client.destroy()
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
