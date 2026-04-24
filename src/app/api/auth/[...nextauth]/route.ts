import NextAuth, { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'
import { supabaseAdmin } from '@/lib/supabase'

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: { scope: 'identify email guilds' },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'discord' && profile) {
        const p = profile as any

        // Check if first user — auto-assign organizer
        const { count } = await supabaseAdmin
          .from('users')
          .select('*', { count: 'exact', head: true })
        const isFirstUser = count === 0

        await supabaseAdmin.from('users').upsert({
          discord_id: p.id,
          discord_username: p.username,
          discord_avatar: p.avatar ?? null,
          is_organizer: isFirstUser ? true : undefined,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'discord_id', ignoreDuplicates: false })
      }
      return true
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        const p = profile as any
        token.discordId = p.id
        token.discordUsername = p.username
        token.discordAvatar = p.avatar ?? null

        const { data: dbUser } = await supabaseAdmin
          .from('users')
          .select('id, is_organizer, is_superuser, is_captain, ingame_name')
          .eq('discord_id', p.id)
          .single()

        if (dbUser) {
          token.userId = dbUser.id
          token.isOrganizer = dbUser.is_organizer
          token.isSuperUser = dbUser.is_superuser
          token.isCaptain = dbUser.is_captain
          token.ingameName = dbUser.ingame_name
        }
      }
      return token
    },

    async session({ session, token }) {
      session.user.discordId = token.discordId as string
      session.user.discordUsername = token.discordUsername as string
      session.user.discordAvatar = token.discordAvatar as string
      session.user.userId = token.userId as string
      session.user.isOrganizer = token.isOrganizer as boolean
      session.user.isSuperUser = token.isSuperUser as boolean
      session.user.isCaptain = token.isCaptain as boolean
      session.user.ingameName = token.ingameName as string
      return session
    },

    async redirect({ url, baseUrl, token }) {
      // After sign in — route based on role
      if (url === baseUrl || url === `${baseUrl}/`) {
        const t = token as any
        if (t?.isOrganizer || t?.isSuperUser) {
          return `${baseUrl}/dashboard`
        }
        return `${baseUrl}/portal`
      }
      // Allow relative URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`
      // Allow same-origin
      if (url.startsWith(baseUrl)) return url
      return baseUrl
    },
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
