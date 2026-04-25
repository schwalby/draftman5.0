'use client'

import { useSession, signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect } from 'react'

interface TopbarProps {
  items?: { label: string; href: string }[]
}

export function Topbar({ items = [] }: TopbarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [theme, setTheme] = useState<'light' | 'slate'>('light')

  const discordId = (session?.user as any)?.discordId
  const discordAvatar = (session?.user as any)?.discordAvatar
  const ingameName = (session?.user as any)?.ingameName
  const discordUsername = (session?.user as any)?.discordUsername

  const avatarUrl =
    discordId && discordAvatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.png`
      : null

  const initial = (ingameName || discordUsername || '?')[0].toUpperCase()

  // Load saved theme on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('draftman-theme') as 'light' | 'slate' | null
      if (saved === 'slate') setTheme('slate')
    } catch(e) {}
  }, [])

  const handleTheme = (t: 'light' | 'slate') => {
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t === 'slate' ? 'slate' : '')
    try { localStorage.setItem('draftman-theme', t) } catch(e) {}
  }

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      height: '48px',
      background: 'var(--surface)',
      borderLeft: '3px solid var(--khaki)',
      borderBottom: '1px solid var(--border)',
      padding: '0 20px',
      gap: 0,
    }}>

      {/* Logo — wordmark + icon */}
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '15px',
          letterSpacing: '0.08em',
          color: 'var(--khaki)',
          lineHeight: 1,
        }}>
          DRAFTMAN5.0
        </span>
        <Image
          src="/icon.png"
          alt="DRAFT MAN"
          width={26}
          height={26}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
        />
      </Link>

      {/* Divider */}
      <div style={{ width: '1px', height: '20px', background: 'var(--border-strong)', margin: '0 12px', flexShrink: 0 }} />

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
        <Link
          href="/rules"
          style={{
            fontSize: '11px',
            color: pathname === '/rules' ? 'var(--khaki)' : 'var(--text-dim)',
            textDecoration: 'none',
            letterSpacing: '0.04em',
          }}
        >
          Rules
        </Link>
        <Link
          href="/portal"
          style={{
            fontSize: '11px',
            color: pathname === '/portal' ? 'var(--khaki)' : 'var(--text-dim)',
            textDecoration: 'none',
            letterSpacing: '0.04em',
          }}
        >
          Portal
        </Link>
      </div>

      {/* Breadcrumb */}
      {items.length > 0 && (
        <>
          <div style={{ width: '1px', height: '20px', background: 'var(--border-strong)', margin: '0 12px', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            {items.map((item, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                {i > 0 && <span style={{ color: 'var(--border-strong)', fontSize: '10px' }}>›</span>}
                {i < items.length - 1 ? (
                  <Link href={item.href} style={{ fontSize: '11px', color: 'var(--text-dim)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </Link>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>

        {/* Theme toggle */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {(['light', 'slate'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTheme(t)}
              style={{
                padding: '3px 8px',
                fontSize: '9px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                border: '1px solid var(--border-strong)',
                borderRadius: '3px',
                cursor: 'pointer',
                background: theme === t ? 'var(--khaki)' : 'transparent',
                color: theme === t ? 'var(--bg)' : 'var(--text-dim)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>

        {/* Sign out */}
        {session && (
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{
              fontSize: '10px',
              color: 'var(--text-dim)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              padding: '3px 8px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-body)',
            }}
          >
            Sign Out
          </button>
        )}

        {/* Avatar */}
        {session && (
          avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={discordUsername || ''}
              width={28}
              height={28}
              style={{ borderRadius: '50%', border: '1px solid var(--border-strong)' }}
            />
          ) : (
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'var(--surface2)', border: '1px solid var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', color: 'var(--khaki)',
            }}>
              {initial}
            </div>
          )
        )}
      </div>
    </nav>
  )
}
