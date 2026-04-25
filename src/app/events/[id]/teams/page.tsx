'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Topbar } from '@/components/Topbar'
import { Spinner } from '@/components/Spinner'
import SignupDrawer from '@/components/SignupDrawer'

const NATO_NAMES = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
  'Mike', 'November', 'Oscar', 'Papa',
]

const TEAM_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400',
  '#16a085', '#2c3e50', '#7f8c8d', '#1abc9c', '#e67e22',
  '#f39c12', '#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400',
]

interface Player {
  userId: string
  ingameName: string
  discordUsername: string
  isCaptain: boolean
}

interface TeamRow {
  index: number
  name: string
  color: string
  captainId: string
  pickOrder: number
}

function shuffle(arr: number[]): number[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TeamSetupPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const eventId = params.id as string

  const [eventName, setEventName] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [teamCount, setTeamCount] = useState(8)
  const [captains, setCaptains] = useState<Record<number, string>>({})
  const [pickOrder, setPickOrder] = useState<number[]>([0, 1, 2, 3, 4, 5, 6, 7])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [draftInProgress, setDraftInProgress] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
    if (status === 'authenticated' && !session?.user?.isOrganizer) router.push(`/events/${eventId}`)
  }, [status, session, router, eventId])

  const loadPlayers = useCallback(async (currentTeamCount: number, existingCaptains?: Record<number, string>) => {
    const sigRes = await fetch(`/api/events/${eventId}/signups`)
    const sigData = await sigRes.json()
    const confirmed = (Array.isArray(sigData) ? sigData : [])
      .filter((s: any) => !s.ringer)
      .map((s: any) => ({
        userId: s.user_id,
        ingameName: s.users?.ingame_name || s.users?.discord_username || 'Unknown',
        discordUsername: s.users?.discord_username || '',
        isCaptain: s.captain || false,
      }))
    confirmed.sort((a: Player, b: Player) => {
      if (a.isCaptain && !b.isCaptain) return -1
      if (!a.isCaptain && b.isCaptain) return 1
      return a.ingameName.localeCompare(b.ingameName)
    })
    setPlayers(confirmed)

    if (!existingCaptains) {
      const caps: Record<number, string> = {}
      const captainList = confirmed.filter((p: Player) => p.isCaptain)
      const shuffled = [...captainList].sort(() => Math.random() - 0.5)
      shuffled.forEach((p: Player, i: number) => { if (i < currentTeamCount) caps[i] = p.userId })
      setCaptains(caps)
    }
  }, [eventId])

  useEffect(() => {
    if (status !== 'authenticated') return

    async function load() {
      setLoading(true)
      try {
        const evRes = await fetch(`/api/events/${eventId}`)
        const evData = await evRes.json()
        if (evData.event) setEventName(evData.event.name)

        // Check if draft is already in progress
        const picksRes = await fetch(`/api/draft/${eventId}/picks`)
        const picksData = await picksRes.json()
        if (Array.isArray(picksData) && picksData.length > 0) {
          setDraftInProgress(true)
        }

        const teamRes = await fetch(`/api/events/${eventId}/teams`)
        const teamData = await teamRes.json()

        let resolvedTeamCount = 8
        let existingCaptains: Record<number, string> | undefined

        if (teamData.teams && teamData.teams.length > 0) {
          resolvedTeamCount = teamData.teams.length
          setTeamCount(resolvedTeamCount)
          const caps: Record<number, string> = {}
          const order: number[] = new Array(resolvedTeamCount)
          teamData.teams.forEach((t: any) => {
            const idx = NATO_NAMES.indexOf(t.name)
            if (idx >= 0) {
              if (t.captain_id) caps[idx] = t.captain_id
              order[t.pick_order - 1] = idx
            }
          })
          existingCaptains = caps
          setCaptains(caps)
          setPickOrder(order.filter((v) => v !== undefined))
        }

        await loadPlayers(resolvedTeamCount, existingCaptains)
      } catch (err) {
        console.error('Load error:', err)
        setError('Failed to load event data.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [status, eventId])

  async function handleDrawerClose() {
    setDrawerOpen(false)
    const sigRes = await fetch(`/api/events/${eventId}/signups`)
    const sigData = await sigRes.json()
    const confirmed = (Array.isArray(sigData) ? sigData : [])
      .filter((s: any) => !s.ringer)
      .map((s: any) => ({
        userId: s.user_id,
        ingameName: s.users?.ingame_name || s.users?.discord_username || 'Unknown',
        discordUsername: s.users?.discord_username || '',
        isCaptain: s.captain || false,
      }))
    confirmed.sort((a: Player, b: Player) => {
      if (a.isCaptain && !b.isCaptain) return -1
      if (!a.isCaptain && b.isCaptain) return 1
      return a.ingameName.localeCompare(b.ingameName)
    })
    setPlayers(confirmed)
  }

  function handleTeamCountChange(delta: number) {
    const next = Math.max(2, Math.min(16, teamCount + delta))
    if (next < teamCount) {
      const newCaps = { ...captains }
      for (let i = next; i < teamCount; i++) delete newCaps[i]
      setCaptains(newCaps)
    }
    setTeamCount(next)
    setPickOrder(Array.from({ length: next }, (_, i) => i))
  }

  function handleRandomize() {
    setPickOrder(shuffle(Array.from({ length: teamCount }, (_, i) => i)))
  }

  function handleCaptainChange(teamIndex: number, userId: string) {
    setCaptains((prev) => {
      const next = { ...prev }
      if (userId) next[teamIndex] = userId
      else delete next[teamIndex]
      return next
    })
  }

  function getAssignedIds(excludeIndex: number): Set<string> {
    const assigned = new Set<string>()
    Object.entries(captains).forEach(([idx, uid]) => {
      if (parseInt(idx) !== excludeIndex) assigned.add(uid)
    })
    return assigned
  }

  function getOrderNote(): string {
    const names = pickOrder.map((i) => NATO_NAMES[i])
    if (names.length === 0) return ''
    const parts = names.slice(0, 3).map((n, i) => `${n} picks ${['1st', '2nd', '3rd'][i]}`)
    return `Draft order set. ${parts.join(', ')}${teamCount > 3 ? '...' : '.'}`
  }

  async function handleSave() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')

    const rankOf: Record<number, number> = {}
    pickOrder.forEach((teamIdx, rank) => { rankOf[teamIdx] = rank + 1 })

    const teams = Array.from({ length: teamCount }, (_, i) => ({
      name: NATO_NAMES[i],
      color: TEAM_COLORS[i],
      captain_id: captains[i] || null,
      pick_order: rankOf[i],
    }))

    try {
      const res = await fetch(`/api/events/${eventId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teams }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save teams.')
        return
      }
      router.push(`/events/${eventId}/draft`)
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save teams.')
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner />
      </div>
    )
  }

  const rankOf: Record<number, number> = {}
  pickOrder.forEach((teamIdx, rank) => { rankOf[teamIdx] = rank + 1 })

  return (
    <>
      <Topbar items={[
        { label: eventName || 'Event', href: `/events/${eventId}` },
        { label: 'Team Setup', href: `/events/${eventId}/teams` },
      ]} />

      <SignupDrawer eventId={eventId} isOpen={drawerOpen} onClose={handleDrawerClose} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px' }}>

        {/* Draft in progress banner */}
        {draftInProgress && (
          <div style={{
            marginBottom: 24,
            padding: '12px 16px',
            background: 'rgba(200,184,122,0.08)',
            border: '1px solid var(--khaki)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--khaki)', marginBottom: 2 }}>
                Draft in progress
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)' }}>
                Picks have already been made for this event. Rejoin the draft to continue.
              </div>
            </div>
            <button
              onClick={() => router.push(`/events/${eventId}/draft`)}
              style={{
                background: 'var(--khaki)',
                border: 'none',
                color: '#1a1a14',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
                padding: '0 20px',
                height: 34,
                borderRadius: 4,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Rejoin Draft →
            </button>
          </div>
        )}

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-accent)',
            fontSize: 11,
            letterSpacing: '0.12em',
            color: 'var(--khaki)',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            Pre-Draft Configuration
          </div>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 28,
            color: 'var(--text)',
            margin: 0,
          }}>
            Team Setup
          </h1>
        </div>

        {/* Team count + randomize row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-dim)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Number of Teams
          </span>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => handleTeamCountChange(-1)}
              disabled={teamCount <= 2}
              style={{
                background: 'var(--surface)', border: 'none', color: 'var(--khaki)',
                width: 32, height: 32, fontSize: 18,
                cursor: teamCount <= 2 ? 'not-allowed' : 'pointer',
                opacity: teamCount <= 2 ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-body)',
              }}
            >−</button>
            <div style={{
              background: 'var(--bg)', color: 'var(--text)', width: 36, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontFamily: 'var(--font-body)',
              borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)',
            }}>
              {teamCount}
            </div>
            <button
              onClick={() => handleTeamCountChange(1)}
              disabled={teamCount >= 16}
              style={{
                background: 'var(--surface)', border: 'none', color: 'var(--khaki)',
                width: 32, height: 32, fontSize: 18,
                cursor: teamCount >= 16 ? 'not-allowed' : 'pointer',
                opacity: teamCount >= 16 ? 0.4 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-body)',
              }}
            >+</button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{
                background: 'transparent', border: '1px solid var(--border-strong)',
                color: 'var(--khaki)', fontFamily: 'var(--font-body)', fontSize: 11,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '0 14px', height: 32, borderRadius: 4, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >☰ Manage Signups</button>
            <button
              onClick={handleRandomize}
              style={{
                background: 'transparent', border: '1px solid var(--border-strong)',
                color: 'var(--khaki)', fontFamily: 'var(--font-body)', fontSize: 11,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '0 14px', height: 32, borderRadius: 4, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >↻ Randomize Draft Order</button>
          </div>
        </div>

        {/* Order note */}
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)',
          marginBottom: 20, padding: '8px 10px',
          background: 'rgba(200,184,122,0.04)',
          borderLeft: '2px solid rgba(200,184,122,0.25)',
          borderRadius: '0 3px 3px 0',
        }}>
          {getOrderNote()}
        </div>

        {/* Team grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 8, marginBottom: 28,
        }}>
          {Array.from({ length: teamCount }, (_, i) => {
            const rank = rankOf[i]
            const assigned = getAssignedIds(i)
            const currentCap = captains[i] || ''
            const captainPlayers = players.filter((p) => p.isCaptain)
            const regularPlayers = players.filter((p) => !p.isCaptain)

            return (
              <div key={i} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 10, height: 36, borderRadius: 2, background: TEAM_COLORS[i], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: '0.1em',
                    color: 'var(--khaki)', textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    {NATO_NAMES[i]}
                  </div>
                  <select
                    value={currentCap}
                    onChange={(e) => handleCaptainChange(i, e.target.value)}
                    style={{
                      width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
                      color: currentCap ? 'var(--text)' : 'var(--text-dim)',
                      fontFamily: 'var(--font-body)', fontSize: 12,
                      padding: '4px 6px', borderRadius: 3, appearance: 'none' as any,
                      cursor: 'pointer', outline: 'none',
                    }}
                  >
                    <option value="">— assign captain —</option>
                    {captainPlayers.length > 0 && (
                      <optgroup label="★ Captains">
                        {captainPlayers.map((p) => (
                          <option key={p.userId} value={p.userId} disabled={assigned.has(p.userId)}>
                            {p.ingameName}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Players">
                      {regularPlayers.map((p) => (
                        <option key={p.userId} value={p.userId} disabled={assigned.has(p.userId)}>
                          {p.ingameName}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div style={{
                  width: 28, height: 28, flexShrink: 0, borderRadius: '50%',
                  background: rank === 1 ? 'rgba(200,184,122,0.18)' : 'rgba(200,184,122,0.08)',
                  border: rank === 1 ? '1px solid var(--khaki)' : '1px solid rgba(200,184,122,0.22)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                  color: rank === 1 ? 'var(--cream)' : 'var(--khaki)',
                }}>
                  {rank}
                </div>
              </div>
            )
          })}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--rust)',
            marginBottom: 16, padding: '8px 10px',
            background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.25)', borderRadius: 4,
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          paddingTop: 16, borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={() => router.push(`/events/${eventId}`)}
            style={{
              background: 'transparent', border: '1px solid var(--border-strong)',
              color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 11,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '0 16px', height: 34, borderRadius: 4, cursor: 'pointer',
            }}
          >Cancel</button>

          {draftInProgress ? (
            <button
              onClick={() => router.push(`/events/${eventId}/draft`)}
              style={{
                background: 'var(--khaki)', border: 'none', color: '#1a1a14',
                fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: '0.08em',
                textTransform: 'uppercase', fontWeight: 700,
                padding: '0 20px', height: 34, borderRadius: 4, cursor: 'pointer',
              }}
            >Rejoin Draft →</button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: saving ? 'rgba(200,184,122,0.3)' : 'var(--khaki)',
                border: 'none',
                color: saving ? 'rgba(26,26,20,0.5)' : '#1a1a14',
                fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: '0.08em',
                textTransform: 'uppercase', fontWeight: 700,
                padding: '0 20px', height: 34, borderRadius: 4,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >{saving ? 'Saving...' : 'Lock In & Start Draft'}</button>
          )}
        </div>

      </div>
    </>
  )
}
