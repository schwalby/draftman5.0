import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null
      email?: string | null
      image?: string | null
      discordId: string
      discordUsername: string
      discordAvatar: string
      userId: string
      isOrganizer: boolean
      isSuperUser: boolean
      isCaptain: boolean
      ingameName: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    discordId?: string
    discordUsername?: string
    discordAvatar?: string
    userId?: string
    isOrganizer?: boolean
    isSuperUser?: boolean
    isCaptain?: boolean
    ingameName?: string
  }
}
