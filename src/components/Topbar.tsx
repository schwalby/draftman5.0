'use client'

import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'

interface BreadcrumbItem {
  label: string
  href: string
}

interface TopbarProps {
  items?: BreadcrumbItem[]
}

export function Topbar({ items }: TopbarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()

  const avatarUrl = session?.user?.discordAvatar || null

  const fallbackInitial = (session?.user?.ingameName || session?.user?.discordUsername || '?')[0].toUpperCase()

  return (
    <div style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      borderLeft: '3px solid var(--khaki)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      height: 48,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 18,
        letterSpacing: 3,
        color: 'var(--khaki)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        marginRight: 24,
        paddingRight: 24,
        borderRight: '1px solid var(--border)',
      }}>
        DRAFTMAN5.0
      </Link>

      {/* Nav links */}
      <Link href="/rules" style={{
        fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: pathname === '/rules' ? 'var(--khaki)' : 'var(--text-dim)',
        textDecoration: 'none', marginRight: 24, whiteSpace: 'nowrap',
        fontFamily: 'var(--font-body)',
        borderBottom: pathname === '/rules' ? '1px solid var(--khaki)' : 'none',
        paddingBottom: pathname === '/rules' ? 2 : 0,
      }}>
        Rules
      </Link>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        {items?.map((item, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={{ color: 'rgba(200,184,122,0.3)', fontSize: 14 }}>›</span>}
            {i < items.length - 1 ? (
              <Link href={item.href} style={{ fontSize: 12, color: 'var(--text-dim)', textDecoration: 'none' }}>
                {item.label}
              </Link>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{item.label}</span>
            )}
          </span>
        ))}
      </div>

      {/* User */}
      {session && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          borderLeft: '1px solid var(--border)',
          paddingLeft: 20, marginLeft: 20,
        }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="avatar"
              style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border-strong)', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '1px solid var(--border-strong)',
              background: 'rgba(200,184,122,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: 'var(--khaki)',
              fontFamily: 'var(--font-heading)', letterSpacing: '0.05em',
            }}>
              {fallbackInitial}
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
            {session.user.ingameName || session.user.discordUsername}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{ fontSize: 10, color: 'var(--rust)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', padding: 0 }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
