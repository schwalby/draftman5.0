'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/Topbar'

interface DebugRow {
  id: string
  created_at: string
  is_12man: boolean
  winning_side: string | null
  score_allies: number
  score_axis: number
  half1_allies: number | null
  half1_axis: number | null
  half2_allies: number | null
  half2_axis: number | null
  map: string | null
  ktp_match_id: string | null
  allies_steam_ids: string[]
  axis_steam_ids: string[]
  resolved_team_allies: string | null
  resolved_team_axis: string | null
  matched_tournament_match_id: string | null
  report_status: string
  report_detail: string | null
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  reported:                  { bg: 'rgba(90,156,90,0.15)',   color: '#5a9c5a', label: 'Reported' },
  '12man_skipped':           { bg: 'rgba(126,184,212,0.12)', color: '#6a8ca4', label: '12man' },
  report_failed:             { bg: 'rgba(192,57,43,0.15)',   color: '#c0392b', label: 'Report failed' },
  report_error:              { bg: 'rgba(192,57,43,0.15)',   color: '#c0392b', label: 'Report error' },
  error:                     { bg: 'rgba(192,57,43,0.15)',   color: '#c0392b', label: 'Error' },
}
const DEFAULT_STYLE = { bg: 'rgba(200,132,42,0.15)', color: '#c8842a', label: 'Unresolved' }

function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? { ...DEFAULT_STYLE, label: status.replace(/_/g, ' ') }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleString('en-US')
}

function shortId(id: string | null): string {
  if (!id) return '—'
  return id.slice(0, 8)
}

export default function KTPDebugPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [rows, setRows] = useState<DebugRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/ktp-debug')
    const data = await res.json()
    if (Array.isArray(data)) setRows(data)
    setLastFetch(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!session || (!session.user.isSuperUser && !session.user.isOrganizer)) {
      router.push('/dashboard')
      return
    }
    load()
  }, [session, status, router, load])

  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(load, 4000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [autoRefresh, load])

  if (status === 'loading' || loading) {
    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>Loading…</span>
      </div>
    )
  }

  return (
    <>
      <Topbar />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--khaki)', letterSpacing: 1, margin: 0 }}>
              KTP DEBUG LOG
            </h1>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
              Every parsed KTP result, 12man or draft — Organizer/SuperUser only
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>
              {lastFetch ? `updated ${formatTime(lastFetch.toISOString())}` : ''}
            </span>
            <button
              onClick={() => setAutoRefresh(a => !a)}
              style={{
                background: autoRefresh ? 'rgba(90,156,90,0.15)' : 'var(--surface)',
                color: autoRefresh ? '#5a9c5a' : 'var(--text-dim)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 12px',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {autoRefresh ? '● Live (4s)' : '○ Paused'}
            </button>
            <button
              onClick={load}
              style={{
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 12px',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Refresh now
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
            No KTP embeds parsed yet. Waiting for the bot to see a MATCH COMPLETE message…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(row => {
              const st = statusStyle(row.report_status)
              const hasHalves = row.half1_allies != null || row.half2_allies != null
              return (
                <div
                  key={row.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        background: st.bg, color: st.color,
                        fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: 0.5,
                        padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap',
                      }}>
                        {st.label.toUpperCase()}
                      </span>
                      {row.winning_side && (
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)' }}>
                          {row.winning_side === 'allies' ? 'Allies' : 'Axis'} win {row.score_allies}-{row.score_axis}
                          {hasHalves && (
                            <span style={{ color: 'var(--text-dim)' }}>
                              {' '}(1st {row.half1_allies}-{row.half1_axis}, 2nd {row.half2_allies}-{row.half2_axis})
                            </span>
                          )}
                        </span>
                      )}
                      {row.map && (
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>
                          {row.map}
                        </span>
                      )}
                      {row.ktp_match_id && (
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>
                          {row.ktp_match_id}
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {formatTime(row.created_at)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Allies ({row.allies_steam_ids.length}): </span>
                      {row.allies_steam_ids.length ? row.allies_steam_ids.join(', ') : '—'}
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Axis ({row.axis_steam_ids.length}): </span>
                      {row.axis_steam_ids.length ? row.axis_steam_ids.join(', ') : '—'}
                    </div>
                  </div>

                  {(row.resolved_team_allies || row.resolved_team_axis || row.matched_tournament_match_id || row.report_detail) && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
                      fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-dim)',
                      display: 'flex', gap: 16, flexWrap: 'wrap',
                    }}>
                      {row.resolved_team_allies && <span>team(allies): {shortId(row.resolved_team_allies)}</span>}
                      {row.resolved_team_axis && <span>team(axis): {shortId(row.resolved_team_axis)}</span>}
                      {row.matched_tournament_match_id && <span>match: {shortId(row.matched_tournament_match_id)}</span>}
                      {row.report_detail && (
                        <span style={{ color: '#c0392b', flexBasis: '100%' }}>{row.report_detail}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
