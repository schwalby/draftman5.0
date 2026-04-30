'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { Topbar } from '@/components/Topbar'

interface Team {
  id: string
  name: string
  color: string
  captain_id: string | null
  pick_order: number
  captain?: { ingame_name: string | null; discord_username: string } | null
}

interface Event {
  id: string
  name: string
}

type Assignment = Record<string, 'a' | 'b' | 'pool'>

const RR_ROUNDS = [
  [[0, 3], [1, 2]],
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
]

function captainName(team: Team): string {
  const c = (team as any).captain
  return c?.ingame_name || c?.discord_username || team.name
}

function teamDisplayName(team: Team): string {
  return team.name || captainName(team)
}

export default function TournamentSetupPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const isAdmin = !!(session?.user?.isOrganizer || (session?.user as any)?.isSuperUser)

  const [event, setEvent] = useState<Event | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [assignment, setAssignment] = useState<Assignment>({})
  const [step, setStep] = useState<1 | 2>(1)
  const [dragId, setDragId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [tournamentExists, setTournamentExists] = useState(false)

  const fetchData = useCallback(async () => {
    const [evRes, teamsRes, tournRes] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/teams`),
      fetch(`/api/tournaments?event_id=${eventId}`),
    ])
    if (evRes.ok) {
      const d = await evRes.json()
      setEvent(d.event ?? d)
    }
    if (teamsRes.ok) {
      const d = await teamsRes.json()
      const arr: Team[] = Array.isArray(d) ? d : (d?.teams ?? [])
      const sorted = [...arr].sort((a, b) => (a.pick_order ?? 0) - (b.pick_order ?? 0))
      setTeams(sorted)
      const init: Assignment = {}
      sorted.forEach(t => { init[t.id] = 'pool' })
      setAssignment(init)
    }
    if (tournRes.ok) {
      const d = await tournRes.json()
      if (d?.id) setTournamentExists(true)
    }
  }, [eventId])

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
    if (status === 'authenticated') fetchData()
  }, [status, fetchData, router])

  function showToast(msg: string, err = false) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 3000)
  }

  function countGroup(g: 'a' | 'b') {
    return teams.filter(t => assignment[t.id] === g).length
  }

  function groupTeams(g: 'a' | 'b') {
    return teams.filter(t => assignment[t.id] === g)
  }

  function poolTeams() {
    return teams.filter(t => assignment[t.id] === 'pool')
  }

  function isValid() {
    return countGroup('a') === 4 && countGroup('b') === 4
  }

  function randomize() {
    const shuffled = [...teams].sort(() => Math.random() - 0.5)
    const next: Assignment = {}
    shuffled.forEach((t, i) => { next[t.id] = i < 4 ? 'a' : 'b' })
    setAssignment(next)
  }

  function moveTo(teamId: string, zone: 'a' | 'b' | 'pool') {
    if (zone !== 'pool' && countGroup(zone) >= 4 && assignment[teamId] !== zone) return
    setAssignment(prev => ({ ...prev, [teamId]: zone }))
  }

  function onDragStart(teamId: string) {
    setDragId(teamId)
  }

  function onDrop(zone: 'a' | 'b' | 'pool') {
    if (!dragId) return
    moveTo(dragId, zone)
    setDragId(null)
  }

  async function startTournament() {
    if (!isValid()) return
    setSaving(true)

    const groupA = groupTeams('a')
    const groupB = groupTeams('b')

    const body = {
      event_id: eventId,
      format: 'round_robin',
      groups: [
        { label: 'A', team_ids: groupA.map(t => t.id) },
        { label: 'B', team_ids: groupB.map(t => t.id) },
      ],
    }

    try {
      await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })

      const res = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 409) {
        router.push(`/events/${eventId}/tournament`)
        return
      }

      if (!res.ok) {
        const d = await res.json()
        showToast(d.error || 'Failed to create draft', true)
        setSaving(false)
        return
      }

      router.push(`/events/${eventId}/tournament`)
    } catch {
      showToast('Something went wrong', true)
      setSaving(false)
    }
  }

  if (status === 'loading' || teams.length === 0) {
    return (
      <>
        <Topbar breadcrumbs={[{ label: event?.name ?? 'Event', href: `/events/${eventId}` }, { label: 'Draft Setup' }]} />
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
          Loading...
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar breadcrumbs={[{ label: event?.name ?? 'Event', href: `/events/${eventId}` }, { label: 'Draft Setup' }]} />

      <div style={{ minHeight: '100vh', padding: '40px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          {/* TOURNAMENT ALREADY EXISTS BANNER */}
          {tournamentExists && (
            <div style={{
              background: 'rgba(200,184,122,0.06)',
              border: '1px solid rgba(200,184,122,0.35)',
              borderLeft: '3px solid var(--khaki)',
              borderRadius: 4,
              padding: '16px 20px',
              marginBottom: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 13, letterSpacing: 2, color: 'var(--khaki)', marginBottom: 4 }}>
                  DRAFT IN PROGRESS
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1 }}>
                  A draft has already been created for this event.
                </div>
              </div>
              <button
                onClick={() => router.push(`/events/${eventId}/tournament`)}
                style={{ fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: 2, padding: '8px 16px', background: 'rgba(200,184,122,0.1)', border: '1px solid var(--khaki)', color: 'var(--khaki)', cursor: 'pointer', borderRadius: 3, whiteSpace: 'nowrap' }}
              >
                GO TO TOURNAMENT →
              </button>
            </div>
          )}

          {/* STEP TABS */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 36 }}>
            {(['ASSIGN GROUPS', 'REVIEW'] as const).map((label, i) => {
              const n = i + 1
              const isActive = step === n
              const isDone = step > n
              return (
                <div
                  key={n}
                  onClick={() => isDone ? setStep(n as 1 | 2) : undefined}
                  style={{
                    flex: 1, padding: '10px 0', textAlign: 'center',
                    fontSize: 11, letterSpacing: '0.14em', fontFamily: 'var(--font-body)',
                    cursor: isDone ? 'pointer' : 'default',
                    color: isActive ? 'var(--khaki)' : isDone ? 'var(--green-light)' : 'var(--text-dim)',
                    borderBottom: isActive ? '2px solid var(--khaki)' : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {n}. {label}
                </div>
              )
            })}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, letterSpacing: '0.08em', color: 'var(--khaki)', marginBottom: 8 }}>ASSIGN GROUPS</h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 28, textTransform: 'uppercase' }}>
                Drag teams into Group A and Group B · 4 teams each
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>Drag teams between groups, or randomize.</div>
                <button onClick={randomize} style={{ fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: '0.1em', padding: '7px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', cursor: 'pointer', borderRadius: 3 }}>
                  ⇄ RANDOMIZE
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
                {(['a', 'b'] as const).map(g => {
                  const color = g === 'a' ? '#4a7abf' : '#b85c38'
                  const label = g === 'a' ? 'GROUP A' : 'GROUP B'
                  const gt = groupTeams(g)
                  return (
                    <div key={g}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: `${color}1a`, border: `1px solid ${color}44`, borderBottom: 'none', borderRadius: '3px 3px 0 0' }}>
                        <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', color, fontFamily: 'var(--font-body)' }}>{label}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 'auto', letterSpacing: '0.1em' }}>{gt.length} / 4</span>
                      </div>
                      <div onDragOver={e => e.preventDefault()} onDrop={() => onDrop(g)} style={{ minHeight: 180, padding: 8, border: `1px solid ${color}44`, borderRadius: '0 0 3px 3px', display: 'flex', flexDirection: 'column', gap: 6, background: 'transparent' }}>
                        {gt.length === 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, fontSize: 10, letterSpacing: '0.1em', color: 'var(--border-strong)', fontFamily: 'var(--font-body)' }}>DROP TEAMS HERE</div>
                        )}
                        {gt.map(t => <TeamCard key={t.id} team={t} onDragStart={() => onDragStart(t.id)} />)}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-dim)', marginBottom: 10, fontFamily: 'var(--font-body)', textTransform: 'uppercase' }}>Unassigned Teams</div>
                <div onDragOver={e => e.preventDefault()} onDrop={() => onDrop('pool')} style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 48, padding: 8, background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 3 }}>
                  {poolTeams().length === 0 && (
                    <div style={{ fontSize: 10, color: 'var(--border-strong)', letterSpacing: '0.08em', fontFamily: 'var(--font-body)', padding: '6px 0' }}>All teams assigned</div>
                  )}
                  {poolTeams().map(t => <TeamCard key={t.id} team={t} onDragStart={() => onDragStart(t.id)} />)}
                </div>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 3, fontSize: 11, letterSpacing: '0.06em', marginBottom: 20, fontFamily: 'var(--font-body)', background: isValid() ? 'rgba(90,156,90,0.1)' : 'rgba(192,57,43,0.08)', border: `1px solid ${isValid() ? 'rgba(90,156,90,0.3)' : 'rgba(192,57,43,0.25)'}`, color: isValid() ? 'var(--green-light)' : 'var(--rust)' }}>
                {isValid() ? '✓ Groups balanced — ready to continue.' : `Assign all ${teams.length} teams — 4 per group — to continue. (A: ${countGroup('a')}, B: ${countGroup('b')})`}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
                <button onClick={() => router.push(`/events/${eventId}/draft`)} style={ghostBtn}>← BACK TO DRAFT</button>
                <button onClick={() => setStep(2)} disabled={!isValid()} style={isValid() ? primaryBtn : { ...primaryBtn, opacity: 0.4, cursor: 'not-allowed' }}>NEXT: REVIEW →</button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, letterSpacing: '0.08em', color: 'var(--khaki)', marginBottom: 8 }}>REVIEW</h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: 32, textTransform: 'uppercase' }}>
                Confirm group assignments before starting the draft
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
                {(['a', 'b'] as const).map(g => {
                  const color = g === 'a' ? '#4a7abf' : '#b85c38'
                  const label = g === 'a' ? 'GROUP A' : 'GROUP B'
                  const gt = groupTeams(g)
                  return (
                    <div key={g}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: `${color}1a`, border: `1px solid ${color}44`, borderBottom: 'none', borderRadius: '3px 3px 0 0' }}>
                        <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', color, fontFamily: 'var(--font-body)' }}>{label}</span>
                      </div>
                      <div style={{ border: `1px solid ${color}44`, borderTop: 'none', borderRadius: '0 0 3px 3px', background: 'var(--surface)' }}>
                        {gt.map((t, i) => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < gt.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 16, fontFamily: 'var(--font-body)' }}>{i + 1}</span>
                            <div style={{ width: 9, height: 9, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', fontFamily: 'var(--font-body)' }}>{teamDisplayName(t)}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>★ {captainName(t)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--text-dim)', marginBottom: 16, fontFamily: 'var(--font-body)', textTransform: 'uppercase' }}>Round Robin Schedule</div>
                {(['a', 'b'] as const).map(g => {
                  const color = g === 'a' ? '#4a7abf' : '#b85c38'
                  const label = g === 'a' ? 'GROUP A' : 'GROUP B'
                  const gt = groupTeams(g)
                  return (
                    <div key={g} style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color, marginBottom: 10, fontFamily: 'var(--font-body)' }}>{label}</div>
                      {RR_ROUNDS.map((round, ri) => (
                        <div key={ri} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 6, fontFamily: 'var(--font-body)' }}>ROUND {ri + 1}</div>
                          {round.map(([i1, i2], mi) => {
                            const t1 = gt[i1], t2 = gt[i2]
                            if (!t1 || !t2) return null
                            return (
                              <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, marginBottom: 5, fontFamily: 'var(--font-body)' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: t1.color, flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em' }}>{teamDisplayName(t1)}</span>
                                <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>vs</span>
                                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textAlign: 'right' }}>{teamDisplayName(t2)}</span>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: t2.color, flexShrink: 0 }} />
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
                <button onClick={() => setStep(1)} style={ghostBtn}>← EDIT GROUPS</button>
                <button onClick={startTournament} disabled={saving} style={saving ? { ...greenBtn, opacity: 0.6, cursor: 'not-allowed' } : greenBtn}>
                  {saving ? 'Creating...' : 'START TOURNAMENT →'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: `1px solid var(--border-strong)`, borderLeft: `3px solid ${toast.err ? 'var(--rust)' : 'var(--green-light)'}`, color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12, padding: '10px 16px', borderRadius: 3, zIndex: 999 }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}

function TeamCard({ team, onDragStart }: { team: Team; onDragStart: () => void }) {
  return (
    <div draggable onDragStart={onDragStart} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, cursor: 'grab', userSelect: 'none' }}>
      <span style={{ fontSize: 14, color: 'var(--border-strong)', cursor: 'grab' }}>⠿</span>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', fontFamily: 'var(--font-body)' }}>{teamDisplayName(team)}</span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>★ {captainName(team)}</span>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
  padding: '10px 22px', background: 'rgba(200,184,122,0.1)', border: '1px solid var(--khaki)',
  color: 'var(--khaki)', cursor: 'pointer', borderRadius: 3,
}

const ghostBtn: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
  padding: '10px 22px', background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--text-dim)', cursor: 'pointer', borderRadius: 3,
}

const greenBtn: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
  padding: '10px 22px', background: 'var(--green-light)', border: '1px solid var(--green-light)',
  color: '#1a1a14', cursor: 'pointer', borderRadius: 3, fontWeight: 700,
}
