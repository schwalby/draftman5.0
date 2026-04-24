'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'

interface Event {
  id: string
  name: string
  type: string
  format: string
  status: string
  half_length: number
  starts_at: string | null
  capacity: number
  signup_count?: number
  my_signup?: { class: string[] } | null
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit'
  })
}

export default function EventsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [signingUp, setSigningUp] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/events')
    if (res.ok) {
      const data = await res.json()
      setEvents(data.filter((e: Event) => e.status === 'scheduled' || e.status === 'active'))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') fetchEvents()
  }, [status, fetchEvents])

  async function handleSignUp(e: React.MouseEvent, eventId: string) {
    e.preventDefault()
    e.stopPropagation()
    router.push(`/events/${eventId}`)
  }

  if (status === 'loading' || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  const user = session?.user
  const displayName = user?.ingameName || user?.discordUsername || '?'
  const initial = displayName[0]?.toUpperCase() ?? '?'
  const discordAvatarUrl = user?.discordId && user?.discordAvatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png`
    : null

  const navLink = (active = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 10px', borderRadius: 4, fontSize: 13,
    textDecoration: 'none', marginBottom: 1,
    color: active ? 'var(--khaki)' : 'var(--text-dim)',
    background: active ? 'rgba(200,184,122,0.08)' : 'transparent',
    fontFamily: 'var(--font-body)',
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>

      {/* ── SIDEBAR ─────────────────────────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0, background: 'var(--surface)',
        borderRight: '1px solid var(--border)', display: 'flex',
        flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0
      }}>
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 20, letterSpacing: '0.06em', color: 'var(--khaki)', lineHeight: 1 }}>DRAFTMAN5.0</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginTop: 3 }}>PLAYER PORTAL</div>
        </div>
        <div style={{ padding: '16px 6px 0' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-heading)', fontWeight: 300, letterSpacing: '0.18em', color: 'var(--text-dim)', textTransform: 'uppercase', padding: '0 10px', marginBottom: 6 }}>NAVIGATION</div>
          <Link href="/portal" style={navLink()}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>◈</span> Portal
          </Link>
          <Link href="/events" style={navLink(true)}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>◉</span> Events
          </Link>
          <Link href="/rules" style={navLink()}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>≡</span> Rules
          </Link>
        </div>
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'var(--surface2)', border: '1px solid var(--border-strong)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 12, color: 'var(--khaki)', overflow: 'hidden'
          }}>
            {discordAvatarUrl
              ? <img src={discordAvatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initial
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Player</div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────── */}
      <main style={{ marginLeft: 220, flex: 1, padding: '36px 40px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 760 }}>

          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 32, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1, marginBottom: 6 }}>
            Events
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 28 }}>
            All open and upcoming draft events
          </div>

          {events.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No events open right now. Check back soon.</div>
            </div>
          ) : events.map(event => {
            const isSignedUp = !!event.my_signup
            const typeLabel = event.type === 'draft' ? 'Draft' : 'Community Event'
            const isActive = event.status === 'active'
            const statusColor = isActive ? 'var(--green-light)' : 'var(--khaki)'
            const statusLabel = isActive ? 'Active' : 'Scheduled'
            const countColor = (event.signup_count ?? 0) === 0 ? 'var(--text-dim)'
              : isActive ? 'var(--green-light)' : 'var(--khaki)'

            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: 'var(--surface)',
                  border: `1px solid ${isSignedUp ? 'rgba(200,184,122,0.35)' : 'var(--border)'}`,
                  borderLeft: isSignedUp ? '3px solid var(--khaki)' : undefined,
                  borderRadius: 4, padding: '18px 20px', marginBottom: 8,
                  textDecoration: 'none', color: 'var(--text)',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Pip */}
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                    {event.name}
                    <span style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8,
                      letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 6px',
                      borderRadius: 2, border: `1px solid ${isActive ? 'rgba(90,156,90,0.4)' : 'rgba(200,184,122,0.35)'}`,
                      color: statusColor
                    }}>{statusLabel}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {event.starts_at ? `${formatDateTime(event.starts_at)} · ` : ''}{event.format} · {typeLabel} · {event.half_length} min
                  </div>
                  {isSignedUp && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-dim)', marginTop: 5 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--khaki)', flexShrink: 0 }} />
                      Signed up as <span style={{ color: 'var(--text)', marginLeft: 3 }}>
                        {event.my_signup!.class.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')}
                      </span>
                    </div>
                  )}
                  {!isSignedUp && (
                    <button
                      onClick={e => handleSignUp(e, event.id)}
                      style={{
                        fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9,
                        letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 16px',
                        borderRadius: 3, border: '1px solid var(--khaki)', color: 'var(--khaki)',
                        background: 'rgba(200,184,122,0.08)', cursor: 'pointer', marginTop: 8,
                        display: 'inline-block'
                      }}
                    >Sign Up</button>
                  )}
                </div>

                {/* Count */}
                <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 4 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 22, lineHeight: 1, color: countColor }}>
                    {event.signup_count ?? 0}
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8, letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    signed up
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ color: 'var(--text-dim)', fontSize: 18, flexShrink: 0 }}>›</div>
              </Link>
            )
          })}

        </div>
      </main>
    </div>
  )
}
