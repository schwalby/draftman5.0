'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Image from 'next/image'

const ERROR_STATES: Record<string, { title: string; message: string; hint?: string }> = {
  missing_token: {
    title: 'Invalid link',
    message: 'This verification link is missing a token. Please run /verify in Discord to get a new one.',
  },
  invalid_token: {
    title: 'Link expired or already used',
    message: 'This verification link has already been used or is no longer valid.',
    hint: 'Run /verify in Discord to generate a fresh link.',
  },
  expired_token: {
    title: 'Link expired',
    message: 'This verification link has expired (links are valid for 15 minutes).',
    hint: 'Run /verify in Discord to generate a fresh link.',
  },
  steam_cancelled: {
    title: 'Steam login cancelled',
    message: 'You cancelled the Steam login. Run /verify in Discord to try again.',
  },
  steam_invalid: {
    title: 'Steam verification failed',
    message: 'We could not validate your Steam login. Please try again.',
    hint: 'Run /verify in Discord to generate a fresh link.',
  },
  steam_id_parse: {
    title: 'Steam ID error',
    message: 'We could not read your Steam ID. Please try again.',
  },
  steam_profile_not_found: {
    title: 'Steam profile not found',
    message: 'We could not find your Steam profile. Make sure your profile is set to public and try again.',
  },
  private: {
    title: 'Steam profile is private',
    message: 'Your Steam profile is set to private. We need it to be public to verify your library.',
    hint: 'Set your profile to public in Steam → Settings → Privacy, then run /verify again. You can set it back to private as soon as verification is done.',
  },
  too_new: {
    title: 'Account too new',
    message: 'Your Steam account must be at least 30 days old.',
    hint: 'If you believe this is an error, reach out to a moderator in Discord.',
  },
  no_dod: {
    title: 'Day of Defeat not found',
    message: 'Day of Defeat (1.3) was not found in your Steam library. You must own the game to participate.',
    hint: 'Pick it up on Steam for $4.99. Once added, run /verify in Discord again.',
  },
  db_error: {
    title: 'Something went wrong',
    message: 'We could not save your verification. Please try again or contact a moderator.',
  },
}

const sharedStyles = {
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    border: '1px solid rgba(126,184,212,0.35)',
    borderRadius: 20,
    padding: '4px 14px',
    marginBottom: 32,
    fontSize: 11,
    color: 'var(--text-dim)',
    letterSpacing: '0.08em',
    fontFamily: 'var(--font-body)',
  } as React.CSSProperties,
  wordmark: {
    fontFamily: 'var(--font-heading)',
    fontSize: 64,
    letterSpacing: '0.06em',
    color: 'var(--khaki)',
    lineHeight: 1,
    marginBottom: 10,
    textAlign: 'center',
  } as React.CSSProperties,
  sub: {
    fontSize: 11,
    letterSpacing: '0.2em',
    color: 'var(--text-dim)',
    marginBottom: 28,
    fontFamily: 'var(--font-body)',
    textTransform: 'uppercase',
  } as React.CSSProperties,
  desc: {
    fontSize: 13,
    color: 'var(--text-dim)',
    lineHeight: 1.8,
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: 24,
    fontFamily: 'var(--font-body)',
  } as React.CSSProperties,
  notice: {
    fontSize: 11,
    color: 'var(--text-muted, #6a6050)',
    textAlign: 'center',
    maxWidth: 380,
    marginBottom: 28,
    lineHeight: 1.7,
    fontFamily: 'var(--font-body)',
  } as React.CSSProperties,
  steamBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    background: '#1b2838',
    color: '#c7d5e0',
    border: 'none',
    borderRadius: 6,
    padding: '12px 28px',
    fontSize: 14,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    marginBottom: 12,
    textDecoration: 'none',
  } as React.CSSProperties,
  footerNote: {
    fontSize: 11,
    color: 'var(--text-dim)',
    marginBottom: 48,
    fontFamily: 'var(--font-body)',
  } as React.CSSProperties,
}

function SteamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#c7d5e0" aria-hidden>
      <path d="M11.979 0C5.678 0 .511 4.86.511 10.845c0 2.96 1.309 5.792 3.581 7.77l.013 2.76c0 .304.365.476.613.297l2.853-1.966c1.22.393 2.537.607 3.408.607 6.301 0 11.469-4.86 11.469-10.845C23.448 4.86 18.28 0 11.979 0zm-.687 14.586l-2.976-3.165 5.689-3.345-3.03 3.281 3.004 3.146-5.776 3.407 3.089-3.324z" />
    </svg>
  )
}

function FeatureCards() {
  const cards = [
    {
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>,
      title: 'Draft Signups',
      desc: 'Sign up by class, check in before the draft, get picked by captains.',
    },
    {
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
      title: 'Auto Reminders',
      desc: 'Discord DMs before every event. Never miss a check-in window.',
    },
    {
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
      title: 'Live Board',
      desc: 'Watch the signup sheet and draft board update in real time.',
    },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 48, width: '100%', maxWidth: 560 }}>
      {cards.map(card => (
        <div key={card.title} style={{
          flex: 1,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '16px 14px',
        }}>
          <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>{card.icon}</div>
          <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)', marginBottom: 6, fontWeight: 600 }}>
            {card.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
            {card.desc}
          </div>
        </div>
      ))}
    </div>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
    }}>
      {/* Pill */}
      <div style={sharedStyles.pill}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--khaki)', display: 'inline-block' }} />
        Day of Defeat 1.3 · Steam Verification
      </div>

      {/* Icon */}
      <div style={{ marginBottom: 24 }}>
        <Image src="/icon.png" alt="DRAFT MAN" width={120} height={120} style={{ borderRadius: '50%', objectFit: 'cover' }} />
      </div>

      {/* Wordmark */}
      <div style={sharedStyles.wordmark}>DRAFTMAN5.0</div>
      <div style={sharedStyles.sub}>Steam Verification</div>

      {children}

      <FeatureCards />

      <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
        DRAFT MAN 5.0 · Day of Defeat 1.3
      </div>
    </div>
  )
}

function VerifyContent() {
  const params = useSearchParams()
  const token  = params.get('token')
  const error  = params.get('error')
  const daysLeft = params.get('days_left')

  const steamLoginUrl = token ? `/api/verify/steam?token=${token}` : null

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    const state = ERROR_STATES[error] ?? {
      title: 'Something went wrong',
      message: 'An unexpected error occurred. Please try again.',
    }
    const message = error === 'too_new' && daysLeft
      ? `${state.message} Your account needs ${daysLeft} more day${daysLeft === '1' ? '' : 's'}.`
      : state.message

    return (
      <PageShell>
        <div style={{
          fontSize: 12,
          color: '#e07070',
          background: 'rgba(192,57,43,0.08)',
          border: '1px solid rgba(192,57,43,0.3)',
          borderRadius: 4,
          padding: '12px 20px',
          maxWidth: 420,
          width: '100%',
          marginBottom: 16,
          lineHeight: 1.65,
          fontFamily: 'var(--font-body)',
          textAlign: 'center',
        }}>
          ⚠ {message}
        </div>
        {state.hint && (
          <p style={{ ...sharedStyles.notice, marginBottom: 24 }}>{state.hint}</p>
        )}
        <p style={sharedStyles.notice}>
          <strong style={{ color: 'var(--text-dim)' }}>Privacy note:</strong> Your profile only needs to be public during verification. You can set it back to private once done.
        </p>
        <a href={steamLoginUrl ?? '#'} style={sharedStyles.steamBtn}>
          <SteamIcon />
          Try again with Steam
        </a>
        <div style={sharedStyles.footerNote}>Questions? Ask a moderator in Discord.</div>
      </PageShell>
    )
  }

  // ── Default state ────────────────────────────────────────────────────────
  return (
    <PageShell>
      <p style={sharedStyles.desc}>
        To participate in drafts and 12 mans, link your Steam account below.
        We verify you own <span style={{ color: 'var(--text)' }}>Day of Defeat</span> and have a legitimate account.
      </p>

      {/* Requirements */}
      <div style={{
        width: '100%',
        maxWidth: 420,
        marginBottom: 20,
        border: '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
        background: 'var(--surface)',
      }}>
        <div style={{
          padding: '8px 16px',
          fontSize: 9,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-muted, #6a6050)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface2)',
          fontFamily: 'var(--font-body)',
        }}>
          Requirements
        </div>
        {[
          'Steam account at least 30 days old',
          'Owns Day of Defeat (App ID 30)',
          'Steam profile set to public',
        ].map(req => (
          <div key={req} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            fontSize: 12,
            color: 'var(--text-dim)',
            borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--font-body)',
          }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--khaki-dim, #9a8c5a)', flexShrink: 0 }} />
            {req}
          </div>
        ))}
      </div>

      <p style={sharedStyles.notice}>
        <strong style={{ color: 'var(--text-dim)' }}>Privacy note:</strong> Your profile only needs to be public during verification. Once done, you can set it back to private or friends-only.
      </p>

      {/* Data disclaimer */}
      <div style={{ width: '100%', maxWidth: 420, border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          What we collect
        </div>
        <div style={{ padding: '8px 14px' }}>
          {['Steam display name', 'Avatar image', 'Steam ID', 'Verification status (owns DoD, account age)'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
              <span style={{ color: 'var(--green-light)', fontSize: 10 }}>✓</span>
              {item}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', background: 'rgba(126,184,212,0.03)', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted, #5a5444)', fontFamily: 'var(--font-body)' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          No passwords, emails, payment info, or personal data.{' '}
          <a href="/disclaimer" style={{ color: 'var(--text-dim)', textDecoration: 'underline' }}>Full disclaimer</a>
        </div>
      </div>

      {steamLoginUrl ? (
        <a href={steamLoginUrl} style={sharedStyles.steamBtn}>
          <SteamIcon />
          Login with Steam
        </a>
      ) : (
        <div style={{
          fontSize: 12,
          color: '#e07070',
          background: 'rgba(192,57,43,0.08)',
          border: '1px solid rgba(192,57,43,0.3)',
          borderRadius: 4,
          padding: '12px 20px',
          maxWidth: 420,
          width: '100%',
          marginBottom: 12,
          textAlign: 'center',
          fontFamily: 'var(--font-body)',
        }}>
          No verification token found. Run <strong>/verify</strong> in Discord to get a link.
        </div>
      )}

      <div style={sharedStyles.footerNote}>Questions? Ask a moderator in Discord.</div>
    </PageShell>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 12 }}>
        Loading…
      </div>
    }>
      <VerifyContent />
    </Suspense>
  )
}
