import { SlashCommandBuilder, REST, Routes } from 'discord.js'

// ── Slash command definitions ─────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Link your Steam account')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('12man')
    .setDescription('12 man queue commands')
    .addSubcommand(s => s.setName('init').setDescription('Post the queue embed'))
    .addSubcommand(s => s.setName('clear').setDescription('Clear the queue'))
    .addSubcommand(s => s.setName('forcestart').setDescription('Force start with current players'))
    .addSubcommand(s => s.setName('cancel').setDescription('Cancel active match and re-queue all'))
    .addSubcommand(s => s.setName('settings').setDescription('View and change bot settings'))
    .addSubcommand(s => s.setName('testmode').setDescription('Toggle test mode'))
    .addSubcommand(s => s.setName('config').setDescription('View current config'))
    .addSubcommand(s =>
      s.setName('cooldown').setDescription('Manage captain cooldowns')
        .addStringOption(o => o.setName('action').setDescription('reset or list').setRequired(true)
          .addChoices({ name: 'reset', value: 'reset' }, { name: 'list', value: 'list' }))
        .addUserOption(o => o.setName('player').setDescription('Player')))
    .addSubcommand(s =>
      s.setName('player').setDescription('Manage queue players')
        .addStringOption(o =>
          o.setName('action').setDescription('add, remove, ban, unban, or sub').setRequired(true)
           .addChoices(
             { name: 'add',    value: 'add'    },
             { name: 'remove', value: 'remove' },
             { name: 'ban',    value: 'ban'    },
             { name: 'unban',  value: 'unban'  },
             { name: 'sub',    value: 'sub'    },
           ))
        .addUserOption(o => o.setName('player').setDescription('Target player').setRequired(true))
        .addUserOption(o => o.setName('replacement').setDescription('Replacement (for sub)')))
    .toJSON(),
]

// ── registerCommands ──────────────────────────────────────────────────────────
// Preserved exactly from index.ts — no logic changes
export async function registerCommands(
  botToken: string,
  clientId: string,
  guildId: string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(botToken)
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
    console.log('[bot] Commands registered')
  } catch (err) {
    console.error('[bot] Command registration failed:', err)
  }
}
