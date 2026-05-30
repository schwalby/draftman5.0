import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const commands = [
  new SlashCommandBuilder()
    .setName('draftday')
    .setDescription('Draft day controls — organizer only')
    .addSubcommand(sub => sub
      .setName('checkin')
      .setDescription('Announce that check-in is now open for the active event'))
    .addSubcommand(sub => sub
      .setName('channels')
      .setDescription('Create team voice channels and move players in')),
  new SlashCommandBuilder().setName('signup').setDescription('Sign up for an open draft event'),
  new SlashCommandBuilder().setName('withdraw').setDescription('Withdraw from an event signup'),
  new SlashCommandBuilder().setName('updaterole').setDescription('Update your class for an existing signup'),
  new SlashCommandBuilder().setName('checkin').setDescription('Check in for your draft'),
  new SlashCommandBuilder().setName('status').setDescription('View your signups and check-in status'),
  new SlashCommandBuilder().setName('verify').setDescription('Link your Steam account'),
].map(c => c.toJSON())

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!)

;(async () => {
  console.log('Registering guild slash commands…')
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, process.env.GUILD_ID!),
    { body: commands }
  )
  console.log('Done.')
})()
