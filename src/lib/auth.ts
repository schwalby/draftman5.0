import { NextAuthOptions } from 'next-auth'
import DiscordProvider from 'next-auth/providers/discord'
import { getSupabaseAdmin } from '@/lib/supabase'

const ROLES_TTL_MS = 5 * 60 * 1000 // re-fetch roles every 5 minutes

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
        const supabase = getSupabaseAdmin()

        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
        const isFirstUser = count === 0

        // DEV MODE: auto-grant Draft Admin to all real users on first login
        // Remove NEXT_PUBLIC_DEV_MODE from Railway env vars to disable before go-live
        const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
        const isFakeUser = p.id?.startsWith('1000000000000000')
        const autoGrantOrganizer = isFirstUser || (isDevMode && !isFakeUser)

        await supabase.from('users').upsert({
          discord_id: p.id,
          discord_username: p.username,
          discord_avatar: p.avatar ?? null,
          is_organizer: autoGrantOrganizer ? true : undefined,
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

        const { data: dbUser } = await getSupabaseAdmin()
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
          token.rolesCheckedAt = Date.now()
        }
      } else if (token.userId) {
        const now = Date.now()
        if (now - (token.rolesCheckedAt ?? 0) > ROLES_TTL_MS) {
          try {
            const { data: dbUser } = await getSupabaseAdmin()
              .from('users')
              .select('is_organizer, is_superuser, is_captain, ingame_name')
              .eq('id', token.userId)
              .single()
            if (dbUser) {
              token.isOrganizer = dbUser.is_organizer
              token.isSuperUser = dbUser.is_superuser
              token.isCaptain = dbUser.is_captain
              token.ingameName = dbUser.ingame_name
            } else {
              // Row deleted — revoke all elevated access immediately
              token.isOrganizer = false
              token.isSuperUser = false
              token.isCaptain = false
            }
            token.rolesCheckedAt = now
          } catch {
            // DB error — keep cached roles and don't stamp so we retry next tick
          }
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

    async redirect({ url, baseUrl }) {
      if (url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}/dashboard`
      }
      if (url.startsWith('/')) return `${baseUrl}${url}`
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
