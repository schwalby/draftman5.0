import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const commands = [
  new SlashCommandBuilder().setName('signup').setDescription('Sign up for an open draft event'),
  new SlashCommandBuilder().setName('withdraw').setDescription('Withdraw from an event signup'),
  new SlashCommandBuilder().setName('checkin').setDescription('Check in for your draft'),
  new SlashCommandBuilder().setName('status').setDescription('View your signups and check-in status'),
  new SlashCommandBuilder().setName('verify').setDescription('Link your Steam account'),
].map(c => c.toJSON())

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!)

;(async () => {
  console.log('Registering slash commands…')
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
    { body: commands }
  )
  console.log('Done.')
})()
