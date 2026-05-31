'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'
import { Topbar } from '@/components/Topbar'

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
  champion_name?: string | null
  champion_color?: string | null
  my_signup?: { class: string[] } | null
  has_picks?: boolean
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function EventsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [past, setPast] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/events')
    if (res.ok) {
      const data = await res.json()

      // Split completed vs open
      const completed: Event[] = data.filter((e: Event) => e.status === 'completed')
        .sort((a: Event, b: Event) => {
          if (!a.starts_at && !b.starts_at) return 0
          if (!a.starts_at) return 1
          if (!b.starts_at) return -1
          return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
        })
      setPast(completed)

      const open = data.filter((e: Event) => e.status === 'scheduled' || e.status === 'active' || e.status === 'published')
      const enriched = await Promise.all(open.map(async (ev: Event) => {
        try {
          const picksRes = await fetch(`/api/draft/${ev.id}/picks`)
          const picks = await picksRes.json()
          return { ...ev, has_picks: Array.isArray(picks) && picks.length > 0 }
        } catch {
          return { ...ev, has_picks: false }
        }
      }))

      const sorted = enriched.sort((a, b) => {
        const aActive = a.status === 'active' || a.has_picks
        const bActive = b.status === 'active' || b.has_picks
        if (aActive && !bActive) return -1
        if (!aActive && bActive) return 1
        if (!a.starts_at && !b.starts_at) return 0
        if (!a.starts_at) return 1
        if (!b.starts_at) return -1
        return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      })
      setEvents(sorted)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') fetchEvents()
  }, [status, fetchEvents])

  if (status === 'loading' || loading) {
    return (
      <>
        <Topbar />
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      </>
    )
  }

  const inProgress = events.filter(e => e.status === 'active' || e.has_picks)
  const upcoming = events.filter(e => e.status !== 'active' && !e.has_picks)
  const hero = upcoming[0] ?? null
  const alsoUpcoming = upcoming.slice(1)

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-body)' }}>
      {text}
    </div>
  )

  return (
    <>
      <Topbar />
      <style>{`
        @keyframes ev-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .ev-section { opacity:0; animation: ev-up 0.45s ease forwards; }

        .ev-inprogress-strip { transition: border-color 0.15s, background 0.15s, transform 0.12s; }
        .ev-inprogress-strip:hover { background: linear-gradient(135deg,rgba(67,206,162,0.1) 0%,rgba(24,90,157,0.12) 100%) !important; border-color: rgba(67,206,162,0.3) !important; transform: translateY(-1px); }

        .ev-hero { transition: transform 0.2s, box-shadow 0.2s; }
        .ev-hero:hover { transform: translateY(-2px); box-shadow: 0 14px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.16) !important; }

        .ev-row { transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s; }
        .ev-row:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18) !important; border-color: rgba(255,255,255,0.22) !important; }

        .ev-signup-pill { transition: transform 0.12s, box-shadow 0.12s; }
        .ev-signup-pill:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(200,184,122,0.2); }

        .ev-past-card { transition: opacity 0.15s, transform 0.12s, box-shadow 0.15s; }
        .ev-past-card:hover { opacity: 1 !important; transform: translateY(-1px); box-shadow: 0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1) !important; }

        .ev-view-btn { transition: border-color 0.12s, background 0.12s, transform 0.12s, box-shadow 0.12s; }
        .ev-view-btn:hover { background: rgba(200,184,122,0.15) !important; border-color: var(--khaki) !important; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(200,184,122,0.2); }

        .ev-signup-btn { transition: transform 0.12s, box-shadow 0.15s, background 0.15s; }
        .ev-signup-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(200,184,122,0.35); background: #d4c688 !important; }
      `}</style>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 24px 80px' }}>

        <div className="ev-section" style={{ fontFamily: 'var(--font-heading)', fontSize: 32, letterSpacing: '0.04em', color: 'var(--khaki)', lineHeight: 1, marginBottom: 6, animationDelay: '0s' }}>
          Events
        </div>
        <div className="ev-section" style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 32, animationDelay: '0.04s' }}>
          All open and upcoming draft events
        </div>

        {/* IN PROGRESS */}
        {inProgress.length > 0 && (
          <div className="ev-section" style={{ marginBottom: 24, animationDelay: '0.06s' }}>
            {sectionLabel('Happening now')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {inProgress.map(e => (
                <Link key={e.id} href={`/events/${e.id}/tournament`}
                  className="ev-inprogress-strip"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit',
                    background: 'linear-gradient(135deg,rgba(67,206,162,0.06) 0%,rgba(24,90,157,0.08) 100%)',
                    border: '1px solid rgba(67,206,162,0.15)', borderRadius: 8, padding: '10px 16px',
                  }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#43cea2', flexShrink: 0, animation: 'ev-pulse 2s ease-in-out infinite' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.format} · {e.type === 'draft' ? 'Draft' : 'Community Event'}{e.starts_at ? ` · ${formatDate(e.starts_at)}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 2, border: '1px solid rgba(67,206,162,0.3)', color: '#43cea2', flexShrink: 0 }}>
                    Draft in progress →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* HERO — NEXT UP */}
        {hero && (() => {
          const isSignedUp = !!hero.my_signup
          const signupPct = hero.capacity ? Math.min(100, Math.round(((hero.signup_count ?? 0) / hero.capacity) * 100)) : 0
          const typeLabel = hero.type === 'draft' ? 'Draft' : 'Community Event'
          return (
            <div className="ev-section" style={{ marginBottom: 10, animationDelay: '0.10s' }}>
              {sectionLabel('Next up')}
              <Link href={`/events/${hero.id}`} className="ev-hero"
                style={{
                  display: 'block', textDecoration: 'none', color: 'inherit',
                  background: isSignedUp
                    ? 'linear-gradient(135deg,rgba(200,184,122,0.18) 0%,rgba(24,90,157,0.14) 100%)'
                    : 'linear-gradient(135deg,rgba(200,184,122,0.1) 0%,rgba(24,90,157,0.12) 100%)',
                  border: `1px solid ${isSignedUp ? 'rgba(200,184,122,0.45)' : 'rgba(200,184,122,0.25)'}`,
                  borderRadius: 10, padding: '28px 32px',
                  boxShadow: isSignedUp
                    ? '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15), 0 0 28px rgba(200,184,122,0.08)'
                    : '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}>
                <div style={{ fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--khaki)', opacity: 0.7, marginBottom: 10, fontFamily: 'var(--font-body)' }}>
                  ● Upcoming{hero.starts_at ? ` · ${formatDate(hero.starts_at)}` : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 32, letterSpacing: '0.03em', color: 'var(--text)', lineHeight: 1.1, marginBottom: 14 }}>
                  {hero.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-dim)', marginBottom: 20, flexWrap: 'wrap' }}>
                  {[hero.format, typeLabel, `${hero.half_length} min halves`, hero.starts_at ? formatTime(hero.starts_at) : null]
                    .filter(Boolean).map((item, i, arr) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {item}
                        {i < arr.length - 1 && <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)', display: 'inline-block' }} />}
                      </span>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>
                      <span>Signups</span>
                      <span style={{ color: 'var(--khaki)' }}>{hero.signup_count ?? 0} / {hero.capacity}</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${signupPct}%`, background: 'linear-gradient(to right,#c8b87a,#43cea2,#185a9d)', borderRadius: 2 }} />
                    </div>
                  </div>
                  {isSignedUp ? (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 20px',
                      borderRadius: 3, border: '1px solid rgba(200,184,122,0.35)',
                      background: 'rgba(200,184,122,0.12)', color: 'var(--khaki)',
                      fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>💀</span>
                      Signed up as {hero.my_signup!.class.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')}
                    </div>
                  ) : (
                    <button className="ev-signup-btn" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 22px',
                      borderRadius: 3, border: 'none', background: 'var(--khaki)', color: '#0e0e0e',
                      fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', fontFamily: 'var(--font-body)',
                      fontWeight: 'bold', cursor: 'pointer', flexShrink: 0,
                    }}>Sign Up →</button>
                  )}
                </div>
              </Link>
            </div>
          )
        })()}

        {/* ALSO UPCOMING */}
        {alsoUpcoming.length > 0 && (
          <div className="ev-section" style={{ marginBottom: 32, animationDelay: '0.16s' }}>
            {sectionLabel('Also upcoming')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alsoUpcoming.map(event => {
                const isSignedUp = !!event.my_signup
                const typeLabel = event.type === 'draft' ? 'Draft' : 'Community Event'
                return (
                  <Link key={event.id} href={`/events/${event.id}`} className="ev-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit',
                      background: isSignedUp ? 'rgba(200,184,122,0.07)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isSignedUp ? 'rgba(200,184,122,0.35)' : 'rgba(255,255,255,0.13)'}`,
                      borderLeft: isSignedUp ? '3px solid var(--khaki)' : undefined,
                      borderRadius: 8, padding: '14px 18px',
                      boxShadow: isSignedUp
                        ? '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(200,184,122,0.15)'
                        : '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.13)',
                    }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: isSignedUp ? 'var(--khaki)' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--text)', letterSpacing: '0.02em', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {event.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {event.starts_at ? `${formatDateTime(event.starts_at)} · ` : ''}{event.format} · {typeLabel} · {event.half_length} min
                      </div>
                      {isSignedUp ? (
                        <div style={{ marginTop: 7 }}>
                          <span style={{
                            fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
                            padding: '3px 9px', borderRadius: 3,
                            border: '1px solid rgba(200,184,122,0.4)', color: 'var(--khaki)',
                            background: 'rgba(200,184,122,0.12)', display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}>
                            <span style={{ fontSize: 11 }}>💀</span> You&apos;re in · {event.my_signup!.class.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')}
                          </span>
                        </div>
                      ) : (
                        <div className="ev-signup-pill" style={{
                          fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9,
                          letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 16px',
                          borderRadius: 3, border: '1px solid var(--khaki)', color: 'var(--khaki)',
                          background: 'rgba(200,184,122,0.08)', cursor: 'pointer', marginTop: 8, display: 'inline-block',
                        }}>Sign Up</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, lineHeight: 1, color: 'var(--khaki)' }}>{event.signup_count ?? 0}</div>
                      <div style={{ fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>signed up</div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* PAST DRAFTS */}
        {past.length > 0 && (
          <div className="ev-section" style={{ animationDelay: '0.22s' }}>
            {sectionLabel('Past drafts')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {past.map(event => (
                <div key={event.id} className="ev-past-card"
                  style={{
                    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '12px 16px', opacity: 0.65,
                    boxShadow: '0 2px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: event.champion_color || 'var(--text-dim)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, color: 'var(--text)', letterSpacing: '0.02em', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {event.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>
                      {formatDate(event.starts_at)} · {event.format} · {event.type === 'draft' ? 'Draft' : 'Community Event'}
                    </div>
                    {event.champion_name
                      ? <div style={{ fontSize: 10, color: 'var(--khaki)', letterSpacing: '0.04em' }}>🏆 Winner: {event.champion_name}</div>
                      : <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>No champion declared</div>
                    }
                  </div>
                  <Link href={`/events/${event.id}/summary`} className="ev-view-btn"
                    style={{
                      flexShrink: 0, padding: '8px 20px', fontSize: 10, letterSpacing: '0.1em',
                      textTransform: 'uppercase', border: '1px solid rgba(200,184,122,0.45)',
                      borderRadius: 3, background: 'rgba(200,184,122,0.08)', color: 'var(--khaki)',
                      textDecoration: 'none', fontFamily: 'var(--font-body)',
                    }}>
                    View
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {events.length === 0 && past.length === 0 && (
          <div className="glass" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No events right now. Check back soon.</div>
          </div>
        )}

      </main>
    </>
  )
}
