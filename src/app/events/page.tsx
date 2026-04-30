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
  my_signup?: { class: string[] } | null
  has_picks?: boolean
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

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

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

  return (
    <>
      <Topbar />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 24px 80px' }}>
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
          const inProgress = !!event.has_picks
          const typeLabel = event.type === 'draft' ? 'Draft' : 'Community Event'
          const statusColor = inProgress ? 'var(--green-light)' : event.status === 'active' ? 'var(--green-light)' : 'var(--khaki)'
          const statusLabel = inProgress ? 'In Progress' : event.status === 'active' ? 'Active' : 'Scheduled'
          const countColor = inProgress ? 'var(--green-light)' : (event.signup_count ?? 0) === 0 ? 'var(--text-dim)' : 'var(--khaki)'

          return (
            <Link
              key={event.id}
              href={`/events/${event.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                background: 'var(--surface)',
                border: `1px solid ${inProgress ? 'rgba(90,156,90,0.35)' : isSignedUp ? 'rgba(200,184,122,0.35)' : 'var(--border)'}`,
                borderLeft: inProgress ? '3px solid var(--green-light)' : isSignedUp ? '3px solid var(--khaki)' : undefined,
                borderRadius: 4, padding: '18px 20px', marginBottom: 8,
                textDecoration: 'none', color: 'var(--text)',
              }}
            >
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  {event.name}
                  <span style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8,
                    letterSpacing: '0.14em', textTransform: 'uppercase', padding: '2px 6px',
                    borderRadius: 2,
                    border: `1px solid ${inProgress ? 'rgba(90,156,90,0.4)' : 'rgba(200,184,122,0.35)'}`,
                    color: statusColor,
                  }}>{statusLabel}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {event.starts_at ? `${formatDateTime(event.starts_at)} · ` : ''}{event.format} · {typeLabel} · {event.half_length} min
                </div>

                {inProgress ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--green-light)', marginTop: 5 }}>
                    🔒 Draft in progress — signups closed
                  </div>
                ) : isSignedUp ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-dim)', marginTop: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--khaki)', flexShrink: 0 }} />
                    Signed up as <span style={{ color: 'var(--text)', marginLeft: 3 }}>
                      {event.my_signup!.class.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')}
                    </span>
                  </div>
                ) : (
                  <div style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9,
                    letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 16px',
                    borderRadius: 3, border: '1px solid var(--khaki)', color: 'var(--khaki)',
                    background: 'rgba(200,184,122,0.08)', cursor: 'pointer', marginTop: 8,
                    display: 'inline-block'
                  }}>Sign Up</div>
                )}
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 4 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 22, lineHeight: 1, color: countColor }}>
                  {event.signup_count ?? 0}
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8, letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  signed up
                </div>
              </div>

              <div style={{ color: 'var(--text-dim)', fontSize: 18, flexShrink: 0 }}>›</div>
            </Link>
          )
        })}
      </main>
    </>
  )
}
