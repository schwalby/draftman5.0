'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'

interface TopbarProps {
  items?: { label: string; href: string }[]
}

export function Topbar({ items = [] }: TopbarProps) {
  const { data: session } = useSession()

  const discordId = (session?.user as any)?.discordId
  const discordAvatar = (session?.user as any)?.discordAvatar
  const ingameName = (session?.user as any)?.ingameName
  const discordUsername = (session?.user as any)?.discordUsername

  const avatarUrl =
    discordId && discordAvatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.png`
      : null

  const initial = (ingameName || discordUsername || '?')[0].toUpperCase()

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
      gap: '10px',
    }}>
      {/* Logo */}
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
        <Image
          src="/icon.png"
          alt="DRAFT MAN"
          width={28}
          height={28}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
        />
        <span style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '15px',
          letterSpacing: '0.08em',
          color: 'var(--khaki)',
          lineHeight: 1,
        }}>
          DRAFT MAN 5.0
        </span>
      </Link>

      {/* Divider */}
      {items.length > 0 && (
        <div style={{ width: '1px', height: '20px', background: 'var(--border-strong)', margin: '0 6px' }} />
      )}

      {/* Breadcrumb */}
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {i > 0 && (
            <span style={{ color: 'var(--border-strong)', fontSize: '10px' }}>›</span>
          )}
          {i < items.length - 1 ? (
            <Link href={item.href} style={{ fontSize: '11px', color: 'var(--text-dim)', textDecoration: 'none' }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--text)' }}>{item.label}</span>
          )}
        </span>
      ))}

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <Link href="/rules" style={{ fontSize: '11px', color: 'var(--text-dim)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          Rules
        </Link>
        <Link href="/portal" style={{ fontSize: '11px', color: 'var(--text-dim)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          Portal
        </Link>

        {session && (
          <>
            {avatarUrl ? (
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
            )}
          </>
        )}
      </div>
    </nav>
  )
}
