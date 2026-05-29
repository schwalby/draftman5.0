'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'
import { Topbar } from '@/components/Topbar'
import { Suspense } from 'react'

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

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function VerifiedBanner({ steamName, onDismiss }: { steamName: string; onDismiss: () => void }) {

  return (
    <div style={{
      padding: '20px 24px',
      display: 'flex',
      justifyContent: 'center',
      animation: 'verifiedSlideDown 0.4s ease',
    }}>
      <style>{`
        @keyframes verifiedSlideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        background: 'rgba(76,175,125,0.08)',
        border: '1px solid rgba(76,175,125,0.25)',
        borderRadius: 8,
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        maxWidth: 680,
        width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'rgba(76,175,125,0.12)',
            border: '1px solid rgba(76,175,125,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--green-light)', fontSize: 20, flexShrink: 0,
          }}>✓</div>
          <div>
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300,
              fontSize: 20, letterSpacing: '0.04em',
              color: 'var(--green-light)', marginBottom: 4,
            }}>
              You&apos;re verified — welcome to DRAFTMAN5.0
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Your Steam account <span style={{ color: 'var(--text)' }}>{steamName}</span> is linked.
              You can now sign up for drafts and 12 mans.
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            fontSize: 20, cursor: 'pointer', padding: '4px 8px',
            lineHeight: 1, flexShrink: 0,
          }}
        >×</button>
      </div>
    </div>
  )
}

function PortalContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const justVerified = searchParams.get('verified') === '1'

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(justVerified)

  const [steamId, setSteamId] = useState<string>('')
  const [steamIdInput, setSteamIdInput] = useState<string>('')
  const [steamName, setSteamName] = useState<string>('')
  const [steamAvatar, setSteamAvatar] = useState<string>('')
  const [steamVerified, setSteamVerified] = useState(false)
  const [steamEditing, setSteamEditing] = useState(false)
  const [steamSaving, setSteamSaving] = useState(false)
  const [steamError, setSteamError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/users/me')
      .then(r => r.json())
      .then(data => {
        if (data?.steam_id) {
          setSteamId(data.steam_id)
          setSteamIdInput(data.steam_id)
          setSteamName(data.steam_name ?? '')
          setSteamAvatar(data.steam_avatar ?? '')
          setSteamVerified(data.steam_verified ?? false)
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
        const saved = await res.json()
        setSteamId(saved.steam_id ?? val)
        setSteamName(saved.steam_name ?? '')
        setSteamAvatar(saved.steam_avatar ?? '')
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
      <>
        <Topbar />
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      </>
    )
  }

  const user = session?.user
  const displayName = user?.ingameName || user?.discordUsername || '?'
  const hasSteamId = !!steamId
  const discordAvatarUrl = (user as any)?.discordId && (user as any)?.discordAvatar
    ? `https://cdn.discordapp.com/avatars/${(user as any).discordId}/${(user as any).discordAvatar}.png`
    : null
  const roleLabel = (user as any)?.isSuperUser ? 'SuperUser' : user?.isOrganizer ? 'Draft Admin' : (user as any)?.isCaptain ? 'Captain' : 'Player'

  return (
    <>
      <Topbar />
      <style>{`
        @media (max-width: 600px) {
          .portal-main { padding: 20px 16px 60px !important; }
          .portal-welcome { font-size: 22px !important; }
          .portal-profile-grid { grid-template-columns: 1fr !important; }
          .portal-events-grid { grid-template-columns: 1fr !important; }
        }
        .portal-card { transition: border-color 0.2s, box-shadow 0.2s; position: relative; overflow: hidden; }
        .portal-card::before { content: ''; position: absolute; width: 180px; height: 180px; border-radius: 50%; background: radial-gradient(circle, rgba(126,184,212,0.06) 0%, transparent 70%); pointer-events: none; transform: translate(-50%,-50%); opacity: 0; transition: opacity 0.3s; left: var(--cx, 50%); top: var(--cy, 50%); }
        .portal-card:hover { border-color: rgba(126,184,212,0.38) !important; box-shadow: 0 6px 24px rgba(0,0,0,0.4); }
        .portal-card:hover::before { opacity: 1; }
        .portal-event-card { transition: transform 0.2s, box-shadow 0.2s; }
        .portal-event-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
        .portal-event-btn { transition: transform 0.12s, box-shadow 0.12s; }
        .portal-event-btn:hover { transform: translateY(-1px); }
      `}</style>

      {/* Verified banner */}
      {showVerifiedBanner && (
        <VerifiedBanner
          steamName={steamName || 'your account'}
          onDismiss={() => setShowVerifiedBanner(false)}
        />
      )}

      <main className="portal-main" style={{ maxWidth: 760, margin: '0 auto', padding: showVerifiedBanner ? '8px 24px 80px' : '36px 24px 80px' }}>

        {/* Welcome header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 32, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }} className="portal-welcome">
            Welcome back, {displayName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Day of Defeat 1.3 · Draft Events
          </div>
        </div>

        {/* Profile cards — Discord left, Steam right */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 36 }} className="portal-profile-grid">

          {/* Discord card */}
          <div className="portal-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '16px 20px' }}
            onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--cx', (e.clientX-r.left)+'px'); e.currentTarget.style.setProperty('--cy', (e.clientY-r.top)+'px') }}
            onMouseLeave={e => { e.currentTarget.style.setProperty('--cx','50%'); e.currentTarget.style.setProperty('--cy','50%') }}
          >
            <div style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em',
              color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12,
            }}>Discord</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: 'var(--surface2)', border: '1.5px solid var(--khaki)',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-heading)', fontSize: 18, color: 'var(--khaki)',
                boxShadow: '0 0 8px rgba(200,184,122,0.2)',
              }}>
                {discordAvatarUrl
                  ? <img src={discordAvatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : displayName[0]?.toUpperCase()
                }
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </div>
                <span style={{
                  fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '2px 7px', borderRadius: 2, display: 'inline-block',
                  border: '1px solid rgba(200,184,122,0.3)', color: 'var(--khaki)',
                }}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Steam card */}
          <div className="portal-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '16px 20px' }}
            onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--cx', (e.clientX-r.left)+'px'); e.currentTarget.style.setProperty('--cy', (e.clientY-r.top)+'px') }}
            onMouseLeave={e => { e.currentTarget.style.setProperty('--cx','50%'); e.currentTarget.style.setProperty('--cy','50%') }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{
                fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em',
                color: 'var(--text-dim)', textTransform: 'uppercase',
              }}>Steam Profile</div>
              {!steamEditing && hasSteamId && (
                <button onClick={() => { setSteamIdInput(steamId); setSteamEditing(true); setSteamError(null) }} style={{ fontSize: 9, fontFamily: 'var(--font-heading)', fontWeight: 300, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 2, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)' }}>Edit</button>
              )}
            </div>

            {!hasSteamId || steamEditing ? (
              <div>
                {!steamEditing && (
                  <>
                    <a
                      href="/api/verify/start"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        width: '100%', padding: '10px 16px', borderRadius: 3, cursor: 'pointer',
                        background: 'rgba(28,132,196,0.12)', border: '1px solid rgba(28,132,196,0.35)',
                        color: '#71b8e8', fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 600,
                        letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none',
                        marginBottom: 10,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.492 1.009 2.448-.4.957-1.49 1.41-2.455 1.019zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/>
                      </svg>
                      Verify with Steam
                    </a>
                    <div style={{ marginTop: 10, padding: '7px 10px', background: 'rgba(126,184,212,0.04)', border: '1px solid var(--border)', borderRadius: 3, fontSize: 10, color: 'var(--text-muted, #5a5444)', lineHeight: 1.7 }}>
                      <span style={{ color: 'var(--text-dim)' }}>What we store:</span> your Steam display name, avatar, and ID only. No sensitive data is collected or shared.{' '}
                      <a href="/disclaimer" style={{ color: 'var(--text-dim)', textDecoration: 'underline' }}>Learn more</a>
                    </div>
                  </>
                )}
                {steamEditing && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.6 }}>
                      Accepted formats: <span style={{ color: 'var(--text)' }}>STEAM_0:0:XXXXXXX</span>, <span style={{ color: 'var(--text)' }}>STEAM_0:1:XXXXXXX</span>, or SteamID64.
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <input
                        value={steamIdInput}
                        onChange={e => setSteamIdInput(e.target.value)}
                        placeholder="e.g. STEAM_0:1:12345678"
                        style={{
                          flex: 1, minWidth: 160,
                          background: 'var(--surface2)', border: '1px solid var(--border)',
                          color: 'var(--text)', padding: '7px 10px',
                          fontSize: 12, fontFamily: 'var(--font-body)', borderRadius: 3, outline: 'none',
                        }}
                      />
                      <button
                        onClick={saveSteamId}
                        disabled={steamSaving || !steamIdInput.trim()}
                        style={{
                          fontSize: 11, fontFamily: 'var(--font-body)', letterSpacing: '0.08em',
                          padding: '7px 14px', borderRadius: 3, cursor: 'pointer',
                          background: 'var(--khaki)', color: '#0d0f12', border: 'none',
                          opacity: steamSaving || !steamIdInput.trim() ? 0.5 : 1,
                        }}
                      >
                        {steamSaving ? 'Saving…' : 'Save'}
                      </button>
                      {steamEditing && (
                        <button
                          onClick={cancelEdit}
                          style={{
                            fontSize: 11, fontFamily: 'var(--font-body)', letterSpacing: '0.08em',
                            padding: '7px 12px', borderRadius: 3, cursor: 'pointer',
                            background: 'transparent', color: 'var(--text-dim)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {steamError && (
                      <div style={{ fontSize: 11, color: 'var(--rust)', marginTop: 6 }}>{steamError}</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {steamAvatar ? (
                  <img src={steamAvatar} alt={steamName || 'Steam avatar'}
                    style={{ width: 44, height: 44, borderRadius: 2, border: '1px solid rgba(126,184,212,0.25)', flexShrink: 0, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 2, border: '1px dashed rgba(126,184,212,0.2)', background: 'var(--bg)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: 0.3 }}>
                    &#128100;
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {steamName && (
                    <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {steamName}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, wordBreak: 'break-all' }}>
                    {steamId}
                  </div>
                  {steamVerified && (
                    <span style={{
                      fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '2px 7px', borderRadius: 2, display: 'inline-flex', alignItems: 'center', gap: 4,
                      border: '1px solid rgba(76,175,125,0.3)', color: 'var(--green-light)',
                      background: 'rgba(76,175,125,0.08)', marginBottom: 6,
                    }}>
                      ✓ Verified
                    </span>
                  )}

                </div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }} className="portal-events-grid">
              {events.map(event => {
                const mySignup = event.my_signup
                const isSignedUp = !!mySignup
                const inProgress = !!event.has_picks
                const typeLabel = event.type === 'draft' ? 'Draft' : 'Community Event'
                const canSignup = hasSteamId

                return (
                  <div key={event.id} className="portal-event-card" style={{
                    background: 'var(--surface)',
                    border: `1px solid ${inProgress ? 'rgba(90,156,90,0.35)' : isSignedUp ? 'rgba(126,184,212,0.35)' : 'var(--border)'}`,
                    borderLeft: `3px solid ${inProgress ? 'var(--green-light)' : isSignedUp ? 'var(--khaki)' : 'var(--border)'}`,
                    borderRadius: 4, padding: 18,
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.3 }}>{event.name}</div>
                      <span style={{
                        fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8,
                        letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 7px',
                        borderRadius: 2,
                        border: `1px solid ${inProgress ? 'rgba(90,156,90,0.35)' : 'rgba(126,184,212,0.35)'}`,
                        color: inProgress ? 'var(--green-light)' : 'var(--khaki)',
                        flexShrink: 0,
                      }}>
                        {inProgress ? 'In Progress' : 'Scheduled'}
                      </span>
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {event.starts_at && <span>📅 {formatDateTime(event.starts_at)}</span>}
                      <span>⚔ {event.format} · {typeLabel} · {event.half_length} min halves</span>
                      <span>👥 {event.signup_count ?? 0} / {event.capacity} signed up</span>
                    </div>

                    <div style={{ fontSize: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      {inProgress ? (
                        <span style={{ color: 'var(--green-light)' }}>🔒 Draft in progress — signups closed</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: isSignedUp ? 'var(--khaki)' : 'var(--text-dim)', opacity: isSignedUp ? 1 : 0.4, flexShrink: 0 }} />
                          {isSignedUp
                            ? <span style={{ color: 'var(--text-dim)' }}>Signed up as <span style={{ color: 'var(--text)' }}>{mySignup.class.map((c: string) => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')}</span></span>
                            : !canSignup
                              ? <span style={{ color: '#c8842a' }}>Verify Steam to sign up — <a href="/api/verify/start" style={{ color: '#c8842a' }}>verify now ↑</a></span>
                              : <span style={{ color: 'var(--text-dim)' }}>Not signed up</span>
                          }
                        </div>
                      )}
                    </div>

                    <Link href={`/events/${event.id}`} style={{
                      marginTop: 'auto',
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
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Draft history will appear here after your first completed event.</div>
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

      </main>
    </>
  )
}

export default function PortalPage() {
  return (
    <Suspense fallback={<><Topbar /><div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div></>}>
      <PortalContent />
    </Suspense>
  )
}
