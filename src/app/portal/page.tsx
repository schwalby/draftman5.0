'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
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
  signup_opens_at: string | null
  capacity: number
  signup_count?: number
  my_signup?: { class: string[] } | null
  has_picks?: boolean
}

const CLASS_COLORS: Record<string, string> = {
  rifle: '#c8a050', third: '#4a9c6a', light: '#4a9c6a',
  heavy: '#9c5a4a', sniper: '#5a6a9c', flex: '#888888',
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PortalPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState(false)

  // Steam ID state
  const [steamId, setSteamId] = useState<string>('')
  const [steamIdInput, setSteamIdInput] = useState<string>('')
  const [steamEditing, setSteamEditing] = useState(false)
  const [steamSaving, setSteamSaving] = useState(false)
  const [steamError, setSteamError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setDarkMode(current === 'slate')
  }, [])

  function toggleTheme() {
    const next = darkMode ? '' : 'slate'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('draftman-theme', next === 'slate' ? 'slate' : 'light')
    setDarkMode(!darkMode)
  }

  // Fetch current user's steam_id on load
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/users/me')
      .then(r => r.json())
      .then(data => {
        if (data?.steam_id) {
          setSteamId(data.steam_id)
          setSteamIdInput(data.steam_id)
        }
      })
  }, [status])

  async function saveSteamId() {
    const val = steamIdInput.trim()
    if (!val) return
    setSteamError(null)
    setSteamSaving(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steam_id: val }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSteamError(err.error ?? 'Failed to save')
      } else {
        setSteamId(val)
        setSteamEditing(false)
      }
    } catch {
      setSteamError('Network error')
    }
    setSteamSaving(false)
  }

  function cancelEdit() {
    setSteamIdInput(steamId)
    setSteamEditing(false)
    setSteamError(null)
  }

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/events')
    if (res.ok) {
      const data = await res.json()
      const open = data.filter((e: Event) => e.status === 'scheduled' || e.status === 'active')
      const enriched = await Promise.all(open.map(async (ev: Event) => {
        try {
          const picksRes = await fetch(`/api/draft/${ev.id}/picks`)
          const picks = await picksRes.json()
          return { ...ev, has_picks: Array.isArray(picks) && picks.length > 0 }
        } catch {
          return { ...ev, has_picks: false }
        }
      }))
      setEvents(enriched)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') fetchEvents()
  }, [status, fetchEvents])

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

  const hasSteamId = !!steamId

  const navLink = (active = false): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 10px', borderRadius: 4, fontSize: 13,
    textDecoration: 'none', marginBottom: 1,
    color: active ? 'var(--khaki)' : 'var(--text-dim)',
    background: active ? 'rgba(200,184,122,0.08)' : 'transparent',
    cursor: 'pointer', border: 'none', fontFamily: 'var(--font-body)',
    width: '100%', textAlign: 'left' as const,
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>

      {/* ═══ SIDEBAR ═══ */}
      <aside style={{
        width: 220, flexShrink: 0, background: 'var(--surface)',
        borderRight: '1px solid var(--border)', display: 'flex',
        flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0
      }}>
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 20, letterSpacing: '0.06em', color: 'var(--khaki)', lineHeight: 1 }}>
            DRAFTMAN5.0
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginTop: 3 }}>
            PLAYER PORTAL
          </div>
        </div>

        <div style={{ padding: '16px 6px 0' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-heading)', fontWeight: 300, letterSpacing: '0.18em', color: 'var(--text-dim)', textTransform: 'uppercase', padding: '0 10px', marginBottom: 6 }}>
            NAVIGATION
          </div>
          {(user?.isOrganizer || (user as any)?.isSuperUser) && (
            <Link href="/dashboard" style={navLink()}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>&#9642;</span> Dashboard
            </Link>
          )}
          <Link href="/portal" style={navLink(true)}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>&#9675;</span> Events
          </Link>
          <Link href="/rules" style={navLink()}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>&#8801;</span> Rules
          </Link>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>◑</span> Dark Mode
            </span>
            <div
              onClick={toggleTheme}
              style={{
                width: 36, height: 20, borderRadius: 20, position: 'relative', cursor: 'pointer',
                background: darkMode ? 'rgba(200,184,122,0.2)' : 'var(--surface2)',
                border: `1px solid ${darkMode ? 'var(--border-strong)' : 'var(--border)'}`,
                transition: 'background 0.2s, border-color 0.2s', flexShrink: 0
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: darkMode ? 18 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: darkMode ? 'var(--khaki)' : 'var(--text-dim)',
                transition: 'left 0.2s, background 0.2s'
              }} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'var(--surface2)', border: '1px solid var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 12, color: 'var(--khaki)', overflow: 'hidden'
            }}>
              {discordAvatarUrl
                ? <img src={discordAvatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initial}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
              <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Player</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 10, letterSpacing: '0.08em', fontFamily: 'var(--font-body)', padding: 0 }}
            >Sign Out</button>
          </div>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main style={{ marginLeft: 220, flex: 1, padding: '36px 40px 80px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 760 }}>

          {/* Missing Steam ID banner */}
          {!hasSteamId && (
            <div style={{
              background: 'rgba(200,132,42,0.06)',
              border: '1px solid rgba(200,132,42,0.35)',
              borderRadius: 4,
              padding: '10px 14px',
              marginBottom: 20,
              fontSize: 12,
              color: '#c8842a',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>&#9888;</span>
              Add your Steam ID below before you can sign up for events.
            </div>
          )}

          {/* Welcome row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 36, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 32, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>
                Welcome back, {displayName}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
                Day of Defeat 1.3 · Draft Events
              </div>
            </div>

            {/* Steam ID widget */}
            <div style={{ minWidth: 220 }}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--font-heading)', fontWeight: 300,
                letterSpacing: '0.16em', color: 'var(--text-dim)',
                textTransform: 'uppercase', marginBottom: 5,
              }}>
                Steam ID
              </div>

              {/* State: no Steam ID or editing */}
              {(!hasSteamId || steamEditing) ? (
                <div style={{
                  border: `1px solid ${hasSteamId ? 'rgba(200,184,122,0.35)' : 'rgba(200,132,42,0.5)'}`,
                  borderRadius: 3,
                  padding: '10px 12px',
                  background: hasSteamId ? 'var(--surface)' : 'rgba(200,132,42,0.05)',
                }}>
                  {!hasSteamId && (
                    <div style={{ fontSize: 10, color: '#c8842a', marginBottom: 7, letterSpacing: '0.04em' }}>
                      No Steam ID on file
                    </div>
                  )}
                  <input
                    value={steamIdInput}
                    onChange={e => setSteamIdInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveSteamId() }}
                    placeholder="STEAM_0:0:XXXXXXX"
                    style={{
                      width: '100%',
                      background: 'var(--bg)',
                      border: '1px solid rgba(200,184,122,0.25)',
                      borderRadius: 2,
                      padding: '6px 8px',
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      color: 'var(--text)',
                      marginBottom: 7,
                      outline: 'none',
                    }}
                    autoFocus={steamEditing}
                  />
                  {steamError && (
                    <div style={{ fontSize: 10, color: 'var(--rust)', marginBottom: 6 }}>{steamError}</div>
                  )}
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button
                      onClick={saveSteamId}
                      disabled={steamSaving || !steamIdInput.trim()}
                      style={{
                        fontSize: 9, fontFamily: 'var(--font-heading)', fontWeight: 300,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                        border: '1px solid rgba(200,132,42,0.5)',
                        background: 'rgba(200,132,42,0.1)', color: '#c8842a',
                        opacity: steamSaving || !steamIdInput.trim() ? 0.5 : 1,
                      }}
                    >
                      {steamSaving ? '...' : 'Save'}
                    </button>
                    {steamEditing && (
                      <button
                        onClick={cancelEdit}
                        style={{
                          fontSize: 9, fontFamily: 'var(--font-heading)', fontWeight: 300,
                          letterSpacing: '0.1em', textTransform: 'uppercase',
                          padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: 'transparent', color: 'var(--text-dim)',
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* State: saved, read-only */
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  padding: '10px 12px',
                  background: 'var(--surface)',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    marginBottom: 7,
                    wordBreak: 'break-all',
                  }}>
                    {steamId}
                  </div>
                  <button
                    onClick={() => { setSteamIdInput(steamId); setSteamEditing(true); setSteamError(null) }}
                    style={{
                      fontSize: 9, fontFamily: 'var(--font-heading)', fontWeight: 300,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '4px 10px', borderRadius: 2, cursor: 'pointer',
                      border: '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text-dim)',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Open Events */}
          <div style={{ marginBottom: 36 }}>
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--text-dim)', textTransform: 'uppercase',
              paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 12
            }}>Open Events</div>

            {events.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 28, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No events open right now. Check back soon.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {events.map(event => {
                  const mySignup = event.my_signup
                  const isSignedUp = !!mySignup
                  const inProgress = !!event.has_picks
                  const typeLabel = event.type === 'draft' ? 'Draft' : 'Community Event'
                  const canSignup = hasSteamId

                  return (
                    <div key={event.id} style={{
                      background: 'var(--surface)',
                      border: `1px solid ${inProgress ? 'rgba(90,156,90,0.35)' : isSignedUp ? 'rgba(200,184,122,0.35)' : 'var(--border)'}`,
                      borderLeft: `3px solid ${inProgress ? 'var(--green-light)' : isSignedUp ? 'var(--khaki)' : 'var(--border)'}`,
                      borderRadius: 4, padding: 18,
                      display: 'flex', flexDirection: 'column', gap: 10
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>{event.name}</div>
                        <span style={{
                          fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8,
                          letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 7px',
                          borderRadius: 2,
                          border: `1px solid ${inProgress ? 'rgba(90,156,90,0.35)' : 'rgba(200,184,122,0.35)'}`,
                          color: inProgress ? 'var(--green-light)' : 'var(--khaki)',
                          flexShrink: 0
                        }}>
                          {inProgress ? 'In Progress' : 'Scheduled'}
                        </span>
                      </div>

                      <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {event.starts_at && <span>📅 {formatDateTime(event.starts_at)}</span>}
                        <span>⚔ {event.format} · {typeLabel} · {event.half_length} min halves</span>
                        <span>👥 {event.signup_count ?? 0} / {event.capacity} signed up</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        {inProgress ? (
                          <span style={{ color: 'var(--green-light)' }}>🔒 Draft in progress — signups closed</span>
                        ) : (
                          <>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: isSignedUp ? 'var(--khaki)' : 'var(--text-dim)', opacity: isSignedUp ? 1 : 0.4, flexShrink: 0 }} />
                            {isSignedUp
                              ? <span style={{ color: 'var(--text-dim)' }}>Signed up as <span style={{ color: 'var(--text)' }}>{mySignup.class.map((c: string) => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')}</span></span>
                              : !canSignup
                                ? <span style={{ color: '#c8842a' }}>Add Steam ID to sign up</span>
                                : <span style={{ color: 'var(--text-dim)' }}>Not signed up</span>
                            }
                          </>
                        )}
                      </div>

                      <Link href={`/events/${event.id}`} style={{
                        fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9,
                        letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 14px',
                        borderRadius: 3, textDecoration: 'none', textAlign: 'center',
                        border: inProgress
                          ? '1px solid var(--green-light)'
                          : isSignedUp ? '1px solid var(--border)' : '1px solid var(--khaki)',
                        color: inProgress
                          ? 'var(--green-light)'
                          : isSignedUp ? 'var(--text-dim)' : 'var(--khaki)',
                        background: inProgress
                          ? 'rgba(90,156,90,0.08)'
                          : isSignedUp ? 'transparent' : 'rgba(200,184,122,0.08)',
                        pointerEvents: (!canSignup && !isSignedUp && !inProgress) ? 'none' : 'auto',
                        opacity: (!canSignup && !isSignedUp && !inProgress) ? 0.4 : 1,
                      }}>
                        {inProgress ? 'View Event' : isSignedUp ? 'View Event' : 'Sign Up'}
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Draft History */}
          <div style={{ marginBottom: 36 }}>
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--text-dim)', textTransform: 'uppercase',
              paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 12
            }}>My Draft History</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Draft history will appear here after your first completed event.</div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ marginBottom: 36 }}>
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--text-dim)', textTransform: 'uppercase',
              paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 12
            }}>My Stats</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 28, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 10, opacity: 0.3 }}>📊</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                Stats are coming soon.<br />
                This section will show your win/loss record, classes played, and draft history.
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
