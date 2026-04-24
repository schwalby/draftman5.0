'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function LandingPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') router.push('/dashboard')
  }, [status, router])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px 48px',
      gap: 0,
    }}>

      {/* Pill label */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        border: '0.5px solid var(--border-strong)', borderRadius: 99,
        padding: '5px 14px', marginBottom: 28,
        fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-dim)',
        fontFamily: 'var(--font-body)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-light)', display: 'inline-block' }} />
        Day of Defeat 1.3 &nbsp;·&nbsp; Community Platform
      </div>

      {/* Title */}
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 64, letterSpacing: '0.04em',
        color: 'var(--khaki)', lineHeight: 1,
        marginBottom: 10, textAlign: 'center',
      }}>
        DRAFTMAN5.0
      </div>

      {/* Subtitle */}
      <div style={{
        fontSize: 11, letterSpacing: '0.18em', color: 'var(--text-dim)',
        textTransform: 'uppercase', marginBottom: 28, fontFamily: 'var(--font-body)',
      }}>
        Community Event Platform
      </div>

      {/* Description */}
      <div style={{
        fontSize: 14, color: 'var(--text-dim)', textAlign: 'center',
        maxWidth: 420, lineHeight: 1.7, marginBottom: 32,
        fontFamily: 'var(--font-body)',
      }}>
        Sign up for drafts and community events, check in before matches,
        and join the draft board — all connected to your{' '}
        <strong style={{ color: 'var(--text)', fontWeight: 500 }}>Discord account.</strong>
      </div>

      {/* Discord button */}
      <button
        onClick={() => signIn('discord', { callbackUrl: '/dashboard' })}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: '#5865F2', color: '#fff', border: 'none',
          padding: '12px 28px', borderRadius: 4, cursor: 'pointer',
          fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 500,
          letterSpacing: '0.04em', marginBottom: 12,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
        </svg>
        Login with Discord
      </button>

      {/* Privacy note */}
      <div style={{
        fontSize: 11, color: 'var(--text-dim)', marginBottom: 48,
        fontFamily: 'var(--font-body)',
      }}>
        We only request your username and avatar. No passwords stored.
      </div>

      {/* Feature cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
        gap: 12, width: '100%', maxWidth: 640, marginBottom: 36,
      }}>
        {[
          { icon: '⚙', title: 'Draft Signups', desc: 'Sign up by class, check in before the draft, get picked by captains.' },
          { icon: '✉', title: 'Auto Reminders', desc: 'Discord DMs before every event. Never miss a check-in window.' },
          { icon: '▶', title: 'Live Board', desc: 'Watch the signup sheet and draft board update in real time.' },
        ].map(f => (
          <div key={f.title} style={{
            background: 'var(--surface)', border: '0.5px solid var(--border)',
            borderRadius: 6, padding: 16,
          }}>
            <div style={{ fontSize: 20, marginBottom: 10 }}>{f.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>{f.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Theme toggle */}
      <div style={{ marginBottom: 16 }}><ThemeToggle /></div>

      {/* Footer */}
      <div style={{ fontSize: 11, color: 'rgba(160,152,128,0.4)', letterSpacing: '0.06em', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
        DRAFT MAN 5.0 &nbsp;·&nbsp; Day of Defeat 1.3
        <br />
        <Link href="/rules" style={{
          color: 'var(--khaki)', textDecoration: 'none',
          borderBottom: '0.5px solid rgba(200,184,122,0.35)',
          fontSize: 11, letterSpacing: '0.06em', marginTop: 10, display: 'inline-block',
        }}>
          View Rules &amp; Format
        </Link>
      </div>

    </div>
  )
}
