'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/Topbar'

interface AuditEntry {
  id: string
  action: string
  actor_id: string | null
  actor_name: string | null
  target_id: string | null
  target_name: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const ACTION_CATEGORIES: Record<string, string> = {
  'match.edit': 'match',
  'match.confirm': 'match',
  'match.reject': 'match',
  'match.report': 'match',
  'role.grant': 'role',
  'role.revoke': 'role',
  'signup.flag': 'signup',
  'signup.unflag': 'signup',
  'signup.note': 'signup',
  'signup.ringer_on': 'signup',
  'signup.ringer_off': 'signup',
  'signup.delete': 'signup',
  'user.delete': 'user',
  'tournament.champion': 'tournament',
  'seed.run': 'dev',
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  match:      { bg: 'rgba(200,184,122,0.15)', color: '#c8b87a',  label: 'Match' },
  role:       { bg: 'rgba(138,101,199,0.15)', color: '#a07ad0',  label: 'Role' },
  signup:     { bg: 'rgba(200,132,42,0.15)',  color: '#c8842a',  label: 'Signup' },
  user:       { bg: 'rgba(192,57,43,0.15)',   color: '#c0392b',  label: 'User' },
  tournament: { bg: 'rgba(90,156,90,0.15)',   color: '#5a9c5a',  label: 'Tournament' },
  dev:        { bg: 'rgba(90,106,156,0.15)',  color: '#5a6a9c',  label: 'Dev' },
}

function formatAction(entry: AuditEntry): string {
  const m = entry.metadata
  switch (entry.action) {
    case 'match.edit':
      return `Edited match result${m.match_id ? '' : ''} — score ${m.prev_score ?? '?'} → ${m.new_score ?? '?'}${m.map ? ` on ${m.map}` : ''}`
    case 'match.confirm':
      return `Confirmed match result — ${m.winner ?? 'winner'} wins${m.score ? ` ${m.score}` : ''}${m.map ? ` on ${m.map}` : ''}`
    case 'match.reject':
      return `Rejected match result${m.reason ? ` — ${m.reason}` : ''}`
    case 'match.report':
      return `Bot reported result — ${m.winner ?? 'winner'} wins${m.score ? ` ${m.score}` : ''}`
    case 'role.grant':
      return `Granted ${m.role ?? 'role'} to ${entry.target_name ?? 'user'}`
    case 'role.revoke':
      return `Revoked ${m.role ?? 'role'} from ${entry.target_name ?? 'user'}`
    case 'signup.flag':
      return `Flagged signup for ${entry.target_name ?? 'player'}${m.event_name ? ` on ${m.event_name}` : ''}`
    case 'signup.unflag':
      return `Unflagged signup for ${entry.target_name ?? 'player'}${m.event_name ? ` on ${m.event_name}` : ''}`
    case 'signup.note':
      return `Added note on ${entry.target_name ?? 'player'}${m.event_name ? ` (${m.event_name})` : ''}`
    case 'signup.ringer_on':
      return `Marked ${entry.target_name ?? 'player'} as ringer${m.event_name ? ` on ${m.event_name}` : ''}`
    case 'signup.ringer_off':
      return `Removed ringer status from ${entry.target_name ?? 'player'}${m.event_name ? ` on ${m.event_name}` : ''}`
    case 'signup.delete':
      return `Removed signup for ${entry.target_name ?? 'player'}${m.event_name ? ` from ${m.event_name}` : ''}`
    case 'user.delete':
      return `Deleted user account ${entry.target_name ?? 'unknown'}`
    case 'tournament.champion':
      return `Declared champion: ${entry.target_name ?? 'team'}${m.event_name ? ` on ${m.event_name}` : ''}`
    case 'seed.run':
      return `Ran seed tool — created test event ${m.event_name ?? ''}`
    default:
      return entry.action
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function getNote(entry: AuditEntry): string | null {
  const m = entry.metadata
  if (entry.action === 'signup.note' && m.note) return String(m.note)
  if (entry.action === 'match.reject' && m.reason) return String(m.reason)
  if (entry.action === 'match.edit' && m.reason) return String(m.reason)
  return null
}

export default function AuditPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    if (status === 'loading') return
    if (!session || !(session.user as any).isSuperUser) {
      router.push('/dashboard')
      return
    }
    fetch('/api/admin/audit')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setEntries(data)
      })
      .finally(() => setLoading(false))
  }, [session, status, router])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return entries.filter(e => {
      const cat = ACTION_CATEGORIES[e.action] ?? 'other'
      if (category && cat !== category) return false
      if (!q) return true
      const note = getNote(e) ?? ''
      const meta = JSON.stringify(e.metadata).toLowerCase()
      return (
        (e.actor_name ?? '').toLowerCase().includes(q) ||
        (e.target_name ?? '').toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        formatAction(e).toLowerCase().includes(q) ||
        note.toLowerCase().includes(q) ||
        meta.includes(q)
      )
    })
  }, [entries, search, category])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    entries.forEach(e => {
      const cat = ACTION_CATEGORIES[e.action] ?? 'other'
      c[cat] = (c[cat] ?? 0) + 1
    })
    return c
  }, [entries])

  if (status === 'loading' || loading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>Loading…</span>
      </div>
    )
  }

  return (
    <>
      <Topbar items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Audit Log', href: '/admin/audit' }]} />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem' }}>

        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--khaki)', letterSpacing: 1, margin: 0 }}>
            AUDIT LOG
          </h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            Full platform activity trail — SuperUser only
          </p>
        </div>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {Object.entries(CATEGORY_COLORS).map(([key, val]) => (
            <div key={key} style={{
              background: 'var(--surface)',
              border: `1px solid var(--border)`,
              borderRadius: 6,
              padding: '6px 14px',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>{val.label}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: val.color }}>{counts[key] ?? 0}</span>
            </div>
          ))}
          <div style={{
            background: 'var(--surface)',
            border: `1px solid var(--border)`,
            borderRadius: 6,
            padding: '6px 14px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginLeft: 'auto',
          }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>Total</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--khaki)' }}>{entries.length}</span>
          </div>
        </div>

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Search player, action, note, score…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 14px',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 14px',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text)',
              minWidth: 140,
            }}
          >
            <option value="">All actions</option>
            {Object.entries(CATEGORY_COLORS).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
        </div>

        {/* Result count */}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
          Showing {filtered.length} of {entries.length} entries
        </div>

        {/* Feed */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
            No entries match your search.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(entry => {
              const cat = ACTION_CATEGORIES[entry.action] ?? 'other'
              const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.match
              const note = getNote(entry)
              return (
                <div
                  key={entry.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  {/* Badge */}
                  <span style={{
                    background: colors.bg,
                    color: colors.color,
                    fontFamily: 'var(--font-heading)',
                    fontSize: 11,
                    letterSpacing: 0.5,
                    padding: '3px 9px',
                    borderRadius: 99,
                    whiteSpace: 'nowrap',
                    marginTop: 1,
                  }}>
                    {colors.label.toUpperCase()}
                  </span>

                  {/* Body */}
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>
                      {formatAction(entry)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
                      by {entry.actor_name ?? 'unknown'} · {entry.action}
                    </div>
                    {note && (
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--text-dim)',
                        marginTop: 6,
                        padding: '5px 10px',
                        background: 'var(--surface2)',
                        borderRadius: 4,
                        borderLeft: '2px solid var(--border-strong)',
                      }}>
                        {note}
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {formatTime(entry.created_at)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
