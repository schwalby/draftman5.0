'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Team {
  id: string
  name: string
  color: string
  captain_id: string | null
  pick_order: number
  captain?: { ingame_name: string | null; discord_username: string }
  picks?: DraftPick[]
}

interface DraftPick {
  id: string
  team_id: string
  user_id: string
  pick_number: number
  class: string | null
  picked_at: string
  user?: { ingame_name: string | null; discord_username: string }
}

interface Signup {
  id: string
  user_id: string
  class: string[]
  priority: number
  user?: { ingame_name: string | null; discord_username: string }
}

interface Event {
  id: string
  name: string
  format: string
  status: string
}

const CLS_COLOR: Record<string, string> = {
  rifle: 'var(--rifle)', light: 'var(--light)', heavy: 'var(--heavy)',
  sniper: 'var(--sniper)', flex: 'var(--flex)'
}
const CLS_SHORT: Record<string, string> = {
  rifle: 'Ri', light: 'Lt', heavy: 'Hv', sniper: 'Sn', flex: 'Fx'
}
const CLS_LABEL: Record<string, string> = {
  rifle: 'Rifle', light: 'Light', heavy: 'Heavy', sniper: 'Sniper', flex: 'Flex'
}
const SLOTS_PER_TEAM = 5

export default function DraftPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const eventId = params.id

  const [event, setEvent] = useState<Event | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [signups, setSignups] = useState<Signup[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null) // user_id
  const [classFilter, setClassFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [picking, setPicking] = useState(false)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [darkMode, setDarkMode] = useState(true)
  const [timerOn, setTimerOn] = useState(true)
  const [timerSecs, setTimerSecs] = useState(90)
  const [twoCol, setTwoCol] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const timerSecsRef = useRef(90)

  const isOrganizer = session?.user?.isOrganizer || session?.user?.isSuperUser
  const myUserId = session?.user?.userId

  // ── Fetch ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [evRes, teamsRes, picksRes, signupsRes] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch(`/api/events/${eventId}/teams`),
      fetch(`/api/draft/${eventId}/picks`),
      fetch(`/api/events/${eventId}/signups`),
    ])
    if (evRes.ok) setEvent(await evRes.json())
    if (teamsRes.ok) { const d = await teamsRes.json(); setTeams(Array.isArray(d) ? d : []) }
    if (picksRes.ok) { const d = await picksRes.json(); setPicks(Array.isArray(d) ? d : []) }
    if (signupsRes.ok) { const d = await signupsRes.json(); setSignups(Array.isArray(d) ? d : []) }
    setLoading(false)
  }, [eventId])

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
    if (status === 'authenticated') fetchAll()
  }, [status, fetchAll, router])

  // ── Realtime ─────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`draft-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `event_id=eq.${eventId}` }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, fetchAll])

  // ── Timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (timerOn) {
      timerRef.current = setInterval(() => {
        timerSecsRef.current = Math.max(0, timerSecsRef.current - 1)
        setTimerSecs(timerSecsRef.current)
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerOn])

  function resetTimer() {
    timerSecsRef.current = 90
    setTimerSecs(90)
  }

  // ── Two-col logic ────────────────────────────────────────────
  useEffect(() => {
    setTwoCol(picks.length >= 20)
  }, [picks.length])

  // ── Draft state ──────────────────────────────────────────────
  const sortedTeams = [...teams].sort((a, b) => a.pick_order - b.pick_order)
  const totalPicks = sortedTeams.length * SLOTS_PER_TEAM
  const currentPickNum = picks.length + 1
  const isDraftDone = picks.length >= totalPicks

  // Snake order: round = floor(picks / teams), if odd round reverse
  function getActiveTeamIdx(): number {
    if (isDraftDone || sortedTeams.length === 0) return -1
    const round = Math.floor(picks.length / sortedTeams.length)
    const posInRound = picks.length % sortedTeams.length
    return round % 2 === 0 ? posInRound : sortedTeams.length - 1 - posInRound
  }

  const activeTeamIdx = getActiveTeamIdx()
  const activeTeam = activeTeamIdx >= 0 ? sortedTeams[activeTeamIdx] : null

  // Can current user pick?
  const canPick = isOrganizer || (activeTeam && activeTeam.captain_id === myUserId)

  // Picks per team
  function teamPicks(teamId: string) {
    return picks.filter(p => p.team_id === teamId).sort((a, b) => a.pick_number - b.pick_number)
  }

  // Captain name helper
  function captainName(team: Team) {
    return team.captain?.ingame_name || team.captain?.discord_username || team.name
  }

  // Player display name
  function playerName(s: Signup) {
    return s.user?.ingame_name || s.user?.discord_username || s.user_id
  }

  function pickedUserIds() {
    return new Set(picks.map(p => p.user_id))
  }

  function captainUserIds() {
    return new Set(teams.map(t => t.captain_id).filter(Boolean))
  }

  // Available players (not picked, not captain)
  const available = signups.filter(s => {
    const picked = pickedUserIds()
    const captains = captainUserIds()
    if (picked.has(s.user_id) || captains.has(s.user_id)) return false
    const name = playerName(s).toLowerCase()
    if (search && !name.includes(search.toLowerCase())) return false
    if (classFilter !== 'all' && !s.class.includes(classFilter)) return false
    return true
  })

  // ── Pick ─────────────────────────────────────────────────────
  async function confirmPick() {
    if (!selected || !activeTeam || !canPick || picking) return
    setPicking(true)
    const res = await fetch(`/api/draft/${eventId}/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selected, team_id: activeTeam.id, pick_number: currentPickNum }),
    })
    setPicking(false)
    if (res.ok) {
      setSelected(null)
      resetTimer()
      showToast('Pick confirmed')
    } else {
      const d = await res.json()
      showToast(d.error || 'Pick failed', true)
    }
  }

  // ── Undo ─────────────────────────────────────────────────────
  async function undoPick() {
    if (!isOrganizer || picks.length === 0) return
    const res = await fetch(`/api/draft/${eventId}/undo`, { method: 'DELETE' })
    if (res.ok) { setSelected(null); resetTimer(); showToast('Pick undone') }
    else showToast('Undo failed', true)
  }

  function showToast(msg: string, err = false) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 2500)
  }

  function toggleTheme() {
    const next = darkMode ? 'olive' : 'slate'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('theme', next)
    setDarkMode(!darkMode)
  }

  // ── Render helpers ───────────────────────────────────────────
  function renderTeamRows() {
    if (twoCol) {
      const half = Math.ceil(sortedTeams.length / 2)
      return (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {sortedTeams.slice(0, half).map((t, i) => renderTeamCol(t, i))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {sortedTeams.slice(half).map((t, i) => renderTeamCol(t, i + half))}
          </div>
        </>
      )
    }
    return <div style={{ display: 'flex', gap: 6 }}>{sortedTeams.map((t, i) => renderTeamCol(t, i))}</div>
  }

  function renderTeamCol(team: Team, idx: number) {
    const isActive = idx === activeTeamIdx
    const tp = teamPicks(team.id)
    const capName = captainName(team)

    return (
      <div key={team.id} style={{
        flex: 1, minWidth: 90, background: 'var(--surface)',
        border: `1px solid ${isActive ? 'var(--khaki)' : 'var(--border)'}`,
        boxShadow: isActive ? '0 0 0 1px rgba(200,184,122,0.12)' : 'none',
        borderRadius: 4, overflow: 'hidden', transition: 'border-color 0.2s',
      }}>
        {/* Header */}
        <div style={{ padding: '6px 8px 5px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ height: 2, borderRadius: 1, background: team.color, marginBottom: 4 }} />
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: 'var(--khaki)', fontSize: 9, marginRight: 4 }}>♛</span>{capName}
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? 'var(--khaki)' : 'var(--text-dim)', marginTop: 1 }}>
            {isActive ? 'Picking now ▸' : `Pick ${team.pick_order}`}
          </div>
        </div>
        {/* Slots */}
        <div style={{ padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Array.from({ length: SLOTS_PER_TEAM }).map((_, si) => {
            const pick = tp[si]
            if (pick) {
              const cls = pick.class || 'flex'
              return (
                <div key={si} style={{ height: 26, borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, fontSize: 13, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR[cls] || 'var(--flex)', flexShrink: 0 }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pick.user?.ingame_name || pick.user?.discord_username || '?'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{CLS_SHORT[cls] || 'Fx'}</span>
                </div>
              )
            }
            return (
              <div key={si} style={{ height: 26, borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px', border: '1px dashed rgba(200,184,122,0.08)' }}>
                <span style={{ fontSize: 11, color: 'rgba(160,152,128,0.25)', letterSpacing: '0.04em' }}>empty</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderPool() {
    const classes = ['rifle', 'light', 'heavy', 'sniper', 'flex']
    const filtered = classFilter === 'all' ? classes : [classFilter]

    return filtered.map(cls => {
      const players = available.filter(s => s.class.includes(cls))
      if (!players.length) return null
      return (
        <div key={cls} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', paddingBottom: 5, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: CLS_COLOR[cls], flexShrink: 0 }} />
            <span style={{ color: CLS_COLOR[cls] }}>{CLS_LABEL[cls]}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{players.length}</span>
          </div>
          {players.map(s => {
            const name = playerName(s)
            const isSel = selected === s.user_id
            return (
              <div
                key={s.user_id}
                onClick={() => canPick && setSelected(isSel ? null : s.user_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 10px', borderRadius: 3, fontSize: 14,
                  background: isSel ? 'rgba(200,184,122,0.1)' : 'var(--surface2)',
                  border: `1px solid ${isSel ? 'var(--khaki)' : 'var(--border)'}`,
                  cursor: canPick ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR[cls], flexShrink: 0 }} />
                <span style={{ color: 'var(--text)' }}>{name}</span>
              </div>
            )
          })}
        </div>
      )
    })
  }

  if (status === 'loading' || loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
  }

  const mins = Math.floor(timerSecs / 60)
  const secs = timerSecs % 60
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`
  const timerUrgent = timerSecs <= 20
  const timerPct = (timerSecs / 90) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font-body)' }}>

      {/* TOPBAR */}
      <header style={{ height: 46, background: 'var(--surface)', borderBottom: '1px solid var(--border)', borderLeft: '3px solid var(--khaki)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 6, flexShrink: 0 }}>
        <Link href="/dashboard" style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 15, letterSpacing: '0.06em', color: 'var(--khaki)', textDecoration: 'none', whiteSpace: 'nowrap' }}>DRAFTMAN5.0</Link>
        <nav style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--border-strong)', padding: '0 4px' }}>›</span>
          <Link href="/events" style={{ color: 'var(--text-dim)', textDecoration: 'none', padding: '0 4px' }}>Events</Link>
          <span style={{ color: 'var(--border-strong)', padding: '0 4px' }}>›</span>
          <Link href={`/events/${eventId}`} style={{ color: 'var(--text-dim)', textDecoration: 'none', padding: '0 4px' }}>{event?.name || 'Event'}</Link>
          <span style={{ color: 'var(--border-strong)', padding: '0 4px' }}>›</span>
          <span style={{ color: 'var(--text)', padding: '0 4px' }}>Draft Board</span>
        </nav>
        {!isDraftDone && (
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 2, border: '1px solid var(--khaki)', color: 'var(--khaki)', background: 'rgba(200,184,122,0.08)', marginLeft: 4, whiteSpace: 'nowrap' }}>
            Round {Math.floor(picks.length / Math.max(sortedTeams.length, 1)) + 1} — Pick {currentPickNum}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/portal" style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', textDecoration: 'none' }}>Portal</Link>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div onClick={toggleTheme} style={{ width: 32, height: 18, borderRadius: 18, position: 'relative', cursor: 'pointer', background: 'rgba(200,184,122,0.2)', border: '1px solid var(--border-strong)', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: darkMode ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--khaki)', transition: 'left 0.2s' }} />
          </div>
          {session?.user?.discordId && session?.user?.discordAvatar ? (
            <img src={`https://cdn.discordapp.com/avatars/${session.user.discordId}/${session.user.discordAvatar}.png`} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border-strong)' }} alt="" />
          ) : (
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: 11, color: 'var(--khaki)' }}>
              {(session?.user?.ingameName || session?.user?.discordUsername || '?')[0].toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{session?.user?.ingameName || session?.user?.discordUsername}</span>
        </div>
      </header>

      {/* PAGE BODY */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* PICK LOG */}
        <aside style={{
          width: twoCol ? 360 : 200, flexShrink: 0,
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', height: '100%',
          transition: 'width 0.3s',
        }}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Pick Log <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 11, color: 'var(--khaki)' }}>{picks.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <div style={{ display: twoCol ? 'grid' : 'flex', gridTemplateColumns: twoCol ? '1fr 1fr' : undefined, flexDirection: twoCol ? undefined : 'column' }}>
              {[...picks].reverse().map(pick => (
                <div key={pick.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderBottom: '1px solid var(--border)', borderRight: twoCol ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 10, color: 'var(--text-dim)', width: 16, textAlign: 'right', flexShrink: 0 }}>{pick.pick_number}</span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: teams.find(t => t.id === pick.team_id)?.color || 'var(--text-dim)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pick.user?.ingame_name || pick.user?.discord_username || '?'}
                  </span>
                  <span style={{ fontSize: 10, color: CLS_COLOR[pick.class || 'flex'] || 'var(--flex)', flexShrink: 0 }}>
                    {CLS_SHORT[pick.class || 'flex'] || 'Fx'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* NOW PICKING BAR */}
          <div style={{ height: 44, flexShrink: 0, background: 'rgba(200,184,122,0.04)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
            {!isDraftDone && activeTeam && (
              <>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTeam.color, animation: 'blink 1.4s infinite', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Now picking —</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{captainName(activeTeam)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>&nbsp;· {activeTeam.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>{available.length} players remaining</span>
              </>
            )}
            {isDraftDone && <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 13, color: 'var(--green)', letterSpacing: '0.04em' }}>Draft complete</span>}

            {/* Admin actions */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {selected && canPick && !isDraftDone && (
                <button
                  onClick={confirmPick}
                  disabled={picking}
                  style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 14px', borderRadius: 3, border: '1px solid var(--green)', color: 'var(--green)', background: 'rgba(90,156,90,0.12)', cursor: 'pointer', opacity: picking ? 0.6 : 1 }}
                >
                  ✓ Pick {signups.find(s => s.user_id === selected) ? playerName(signups.find(s => s.user_id === selected)!) : ''}
                </button>
              )}
              {isOrganizer && picks.length > 0 && (
                <button onClick={undoPick} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--rust)', color: 'var(--rust)', background: 'rgba(192,57,43,0.08)', cursor: 'pointer' }}>↩ Undo</button>
              )}
              <button onClick={() => { setTimerOn(!timerOn) }} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent', cursor: 'pointer' }}>
                {timerOn ? '⏸ Pause' : '▶ Resume'}
              </button>
              {isOrganizer && (
                <button style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent', cursor: 'pointer' }}>End Draft</button>
              )}
            </div>
          </div>

          {/* TEAMS */}
          <div style={{ flexShrink: 0, padding: '10px 12px 0', overflowX: 'auto' }}>
            {renderTeamRows()}
          </div>

          {/* TIMER */}
          <div style={{ height: 36, flexShrink: 0, background: 'var(--surface2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 16px' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Time remaining</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 20, letterSpacing: '0.06em', color: timerUrgent ? 'var(--rust)' : 'var(--khaki)', minWidth: 50, textAlign: 'center', transition: 'color 0.3s' }}>{timerStr}</span>
            <div style={{ flex: 1, maxWidth: 220, height: 2, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: timerUrgent ? 'var(--rust)' : 'var(--khaki)', width: `${timerPct}%`, transition: 'width 1s linear, background 0.3s' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{timerOn ? 'Timer on' : 'Paused'}</span>
          </div>

          {/* PLAYER POOL */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 36, flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Available Players</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 13, color: 'var(--khaki)' }}>{available.length}</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 10px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', outline: 'none', width: 150 }}
              />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {['all', 'rifle', 'light', 'heavy', 'sniper', 'flex'].map(cls => (
                  <button key={cls} onClick={() => setClassFilter(cls)} style={{
                    fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                    border: classFilter === cls ? `1px solid var(--khaki)` : '1px solid var(--border)',
                    color: classFilter === cls ? 'var(--khaki)' : cls === 'all' ? 'var(--text-dim)' : CLS_COLOR[cls],
                    background: classFilter === cls ? 'rgba(200,184,122,0.07)' : 'transparent',
                  }}>{cls === 'all' ? 'All' : CLS_LABEL[cls]}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {renderPool()}
            </div>
          </div>

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: `1px solid var(--border-strong)`, borderLeft: `3px solid ${toast.err ? 'var(--rust)' : 'var(--green)'}`, color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12, padding: '10px 16px', borderRadius: 3, zIndex: 999 }}>{toast.msg}</div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
      `}</style>
    </div>
  )
}
