import { Client, GatewayIntentBits } from 'discord.js'

// ── Discord client singleton ───────────────────────────────────────────────────
// Preserved exactly from index.ts — no changes to intents or configuration
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
})
