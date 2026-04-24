'use client'

import { useEffect, useState } from 'react'
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
  starts_at: string | null
  capacity: number
  signup_count?: number
}

function signupColor(count: number, goal: number) {
  if (count === 0) return '#7f8c8d'
  const pct = count / goal
  if (count > goal) return '#3ddc84'
  if (count === goal) return '#5a9c5a'
  if (pct >= 0.65) return '#c8b87a'
  if (pct >= 0.33) return '#c8842a'
  return '#c0392b'
}

function signupBarWidth(count: number, goal: number) {
  if (goal === 0) return '0%'
  return `${Math.min((count / goal) * 100, 100)}%`
}

function ringerCount(count: number, goal: number) {
  return count > goal ? count - goal : 0
}

function statusStyle(status: string): { color: string; label: string } {
  switch (status) {
    case 'draft':     return { color: 'var(--text-dim)', label: 'DRAFT' }
    case 'scheduled': return { color: 'var(--khaki)',    label: 'SCHEDULED' }
    case 'active':    return { color: 'var(--green-light)', label: 'ACTIVE' }
    case 'completed': return { color: 'var(--text-dim)', label: 'COMPLETED' }
    default:          return { color: 'var(--text-dim)', label: status.toUpperCase() }
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [isSuperUser, setIsSuperUser] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
    if (status === 'authenticated' && !session?.user?.isOrganizer && !session?.user?.isSuperUser) router.replace('/portal')
  }, [status, router])

  // Sync dark mode state with html attribute (set by layout.tsx inline script)
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    setDarkMode(current === 'slate')
  }, [])

  function toggleTheme() {
    const next = darkMode ? 'olive' : 'slate'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    setDarkMode(!darkMode)
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchEvents()
    fetchSuperUserStatus()
  }, [status])

  async function fetchEvents() {
    setLoading(true)
    const res = await fetch('/api/events')
    if (res.ok) {
      const data = await res.json()
      setEvents(data)
    }
    setLoading(false)
  }

  async function fetchSuperUserStatus() {
    const res = await fetch('/api/users/me')
    if (res.ok) {
      const data = await res.json()
      setIsSuperUser(data.is_superuser ?? false)
    }
  }

  async function handlePublish(id: string) {
    setActionLoading(id + '-publish')
    await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'scheduled' }),
    })
    await fetchEvents()
    setActionLoading(null)
  }

  async function handleUnpublish(id: string) {
    setActionLoading(id + '-unpublish')
    await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft' }),
    })
    await fetchEvents()
    setActionLoading(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this event? This cannot be undone.')) return
    setActionLoading(id + '-delete')
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    await fetchEvents()
    setActionLoading(null)
  }

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  const user = session?.user
  const discordAvatarUrl = user?.discordId && user?.discordAvatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png`
    : null
  const displayName = user?.ingameName || user?.discordUsername || '?'
  const initial = displayName[0]?.toUpperCase() ?? '?'
  const roleLabel = isSuperUser ? 'SUPERUSER' : user?.isOrganizer ? 'DRAFT ADMIN' : 'PLAYER'

  const draftEvents = events.filter(e => e.status === 'draft')
  const scheduledEvents = events.filter(e => e.status === 'scheduled')
  const activeEvents = events.filter(e => e.status === 'active')
  const completedEvents = events.filter(e => e.status === 'completed')

  // ── Shared sidebar link style ──────────────────────────────────
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

      {/* ═══ SIDEBAR ═══════════════════════════════════════════════ */}
      <aside style={{
        width: 220, flexShrink: 0, background: 'var(--surface)',
        borderRight: '1px solid var(--border)', display: 'flex',
        flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 300, letterSpacing: '0.06em', color: 'var(--khaki)', lineHeight: 1 }}>
            DRAFTMAN5.0
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', marginTop: 3 }}>
            ORGANIZER PANEL
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: '16px 6px 0' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-heading)', letterSpacing: '0.18em', color: 'var(--text-dim)', textTransform: 'uppercase', padding: '0 10px', marginBottom: 6 }}>
            ORGANIZER DASHBOARD
          </div>
          <Link href="/dashboard" style={navLink(true)}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>◈</span> Events
          </Link>
          <Link href="/events/new" style={navLink()}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>＋</span> New Event
          </Link>
          <Link href="/rules" style={navLink()}>
            <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>≡</span> Rules
          </Link>
        </div>

        {/* ── Bottom utility zone ──────────────────────────────── */}
        <div style={{ marginTop: 'auto' }}>

          {/* Theme toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>◑</span> Dark Mode
            </span>
            {/* Toggle track */}
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
                position: 'absolute', top: 2,
                left: darkMode ? 18 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: darkMode ? 'var(--khaki)' : 'var(--text-dim)',
                transition: 'left 0.2s, background 0.2s'
              }} />
            </div>
          </div>

          {/* User Roles — SuperUser only */}
          {isSuperUser && (
            <Link href="/settings" style={{ ...navLink(), padding: '7px 16px' }}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>⊕</span>
              User Roles
              <span style={{
                marginLeft: 'auto', fontFamily: 'var(--font-heading)', fontSize: 7,
                letterSpacing: '0.1em', color: 'var(--bg)', background: 'var(--khaki)',
                padding: '1px 5px', borderRadius: 2
              }}>SU</span>
            </Link>
          )}

          {/* Divider + user info */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'var(--surface2)', border: '1px solid var(--border-strong)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--khaki)', overflow: 'hidden'
            }}>
              {discordAvatarUrl
                ? <img src={discordAvatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initial
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
              <div style={{ fontSize: 9, color: 'var(--khaki)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>{roleLabel}</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              title="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: 4, lineHeight: 1 }}
            >⎋</button>
          </div>
        </div>
      </aside>

      {/* ═══ MAIN ══════════════════════════════════════════════════ */}
      <main style={{ marginLeft: 220, flex: 1, padding: '36px 40px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 300, letterSpacing: '0.04em', lineHeight: 1 }}>
              EVENTS DASHBOARD
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
              {events.length} event{events.length !== 1 ? 's' : ''} total
            </div>
          </div>
          <Link href="/events/new" style={{
            fontFamily: 'var(--font-heading)', fontSize: 12, letterSpacing: '0.1em',
            textTransform: 'uppercase', padding: '9px 20px', borderRadius: 3,
            background: 'rgba(200,184,122,0.12)', border: '1px solid var(--khaki)',
            color: 'var(--khaki)', textDecoration: 'none', flexShrink: 0
          }}>+ New Event</Link>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Draft',     value: draftEvents.length,     color: 'var(--text-dim)' },
            { label: 'Scheduled', value: scheduledEvents.length,  color: 'var(--khaki)' },
            { label: 'Active',    value: activeEvents.length,     color: 'var(--green-light)' },
            { label: 'Completed', value: completedEvents.length,  color: 'var(--text-dim)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '14px 18px' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 400, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Events list */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 48 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 8 }}>NO EVENTS YET</div>
            <div style={{ fontSize: 12 }}>Create your first event to get started.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* ── Unpublished ── */}
            {draftEvents.length > 0 && (
              <div>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.18em',
                  color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10,
                  paddingBottom: 8, borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <span>Unpublished</span>
                  <span style={{ fontSize: 9, color: 'var(--bg)', background: 'var(--text-dim)', padding: '1px 6px', borderRadius: 2, fontFamily: 'var(--font-heading)', letterSpacing: '0.1em' }}>{draftEvents.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {draftEvents.map(event => (
                    <EventRow
                      key={event.id}
                      event={event}
                      actionLoading={actionLoading}
                      onPublish={handlePublish}
                      onUnpublish={handleUnpublish}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Published ── */}
            {[...scheduledEvents, ...activeEvents, ...completedEvents].length > 0 && (
              <div>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.18em',
                  color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10,
                  paddingBottom: 8, borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                  <span>Published</span>
                  <span style={{ fontSize: 9, color: 'var(--bg)', background: 'var(--text-dim)', padding: '1px 6px', borderRadius: 2, fontFamily: 'var(--font-heading)', letterSpacing: '0.1em' }}>{[...scheduledEvents, ...activeEvents, ...completedEvents].length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...scheduledEvents, ...activeEvents, ...completedEvents].map(event => (
                    <EventRow
                      key={event.id}
                      event={event}
                      actionLoading={actionLoading}
                      onPublish={handlePublish}
                      onUnpublish={handleUnpublish}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  )
}

// ── EventRow component ───────────────────────────────────────────
function EventRow({ event, actionLoading, onPublish, onUnpublish, onDelete }: {
  event: Event
  actionLoading: string | null
  onPublish: (id: string) => void
  onUnpublish: (id: string) => void
  onDelete: (id: string) => void
}) {
  const st = statusStyle(event.status)
  const count = event.signup_count ?? 0
  const goal = event.capacity || 48
  const typeLabel = event.type === 'draft' ? 'Draft' : 'Community Event'
  const color = signupColor(count, goal)
  const barWidth = signupBarWidth(count, goal)
  const ringers = ringerCount(count, goal)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 4, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      {/* Status pip */}
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0 }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text)' }}>
            {event.name}
          </span>
          <span style={{
            fontFamily: 'var(--font-heading)', fontSize: 8, letterSpacing: '0.14em',
            textTransform: 'uppercase', padding: '2px 6px', borderRadius: 2,
            border: `1px solid ${st.color}33`, color: st.color
          }}>{st.label}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 12 }}>
          <span>{event.format} · {typeLabel}</span>
          {event.starts_at && <span>{formatDate(event.starts_at)}</span>}
        </div>
      </div>

      {/* Signup block */}
      <div style={{ flexShrink: 0, minWidth: 130, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 400, color, lineHeight: 1 }}>{count}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>/</span>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12, color: 'var(--text-dim)' }}>{goal}</span>
        </div>
        <div style={{ width: '100%', height: 3, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: barWidth, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 8, letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          {ringers > 0
            ? <span>signed up · <span style={{ color }}>{`+${ringers} ringer${ringers > 1 ? 's' : ''}`}</span></span>
            : 'signed up'
          }
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <Link href={`/events/${event.id}`} style={{
          fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.12em',
          textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3,
          border: '1px solid var(--border)', color: 'var(--text-dim)', textDecoration: 'none'
        }}>View</Link>

        {(event.status === 'draft' || event.status === 'scheduled') && (
          <Link href={`/events/${event.id}/edit`} style={{
            fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3,
            border: '1px solid var(--border)', color: 'var(--text-dim)', textDecoration: 'none'
          }}>Edit</Link>
        )}

        {event.status === 'draft' && (
          <button
            onClick={() => onPublish(event.id)}
            disabled={actionLoading === event.id + '-publish'}
            style={{
              fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
              border: '1px solid var(--green-light)', color: 'var(--green-light)',
              background: 'rgba(90,156,90,0.08)', opacity: actionLoading ? 0.6 : 1
            }}
          >Publish</button>
        )}

        {event.status === 'scheduled' && (
          <button
            onClick={() => onUnpublish(event.id)}
            disabled={actionLoading === event.id + '-unpublish'}
            style={{
              fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
              border: '1px solid var(--text-dim)', color: 'var(--text-dim)',
              background: 'transparent', opacity: actionLoading ? 0.6 : 1
            }}
          >Unpublish</button>
        )}

        <button
          onClick={() => onDelete(event.id)}
          disabled={!!actionLoading}
          style={{
            fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, cursor: 'pointer',
            border: '1px solid var(--rust)', color: 'var(--rust)',
            background: 'rgba(192,57,43,0.08)', opacity: actionLoading ? 0.6 : 1
          }}
        >Delete</button>
      </div>
    </div>
  )
}
