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
  captain?: { ingame_name: string | null; discord_username: string } | null
}

interface DraftPick {
  id: string
  team_id: string
  user_id: string
  pick_number: number
  class: string | null
  picked_at: string
  user?: { ingame_name: string | null; discord_username: string } | null
}

interface Signup {
  id: string
  user_id: string
  class: string[]
  priority: number
  ringer: boolean
  users?: { ingame_name: string | null; discord_username: string } | null
}

interface Event {
  id: string
  name: string
  format: string
  status: string
}

interface ContextMenu {
  x: number
  y: number
  userId: string
  name: string
  isDrafted: boolean
  pickId?: string
  pickNumber?: number
  currentClass?: string | null
  isRinger: boolean
}

const CLS_COLOR: Record<string, string> = {
  rifle: 'var(--rifle)', light: 'var(--light)', third: 'var(--light)', heavy: 'var(--heavy)',
  sniper: 'var(--sniper)', flex: 'var(--flex)'
}
const CLS_SHORT: Record<string, string> = {
  rifle: 'Ri', light: 'Lt', third: 'Th', heavy: 'Hv', sniper: 'Sn', flex: 'Fx'
}
const CLS_LABEL: Record<string, string> = {
  rifle: 'Rifle', light: 'Light', third: 'Third', heavy: 'Heavy', sniper: 'Sniper', flex: 'Flex'
}
const ALL_CLASSES = ['rifle', 'light', 'heavy', 'sniper', 'flex']
const SLOTS_PER_TEAM = 5

function playerDisplayName(s: Signup): string {
  return (s as any).users?.ingame_name || (s as any).users?.discord_username || s.user_id
}
function captainDisplayName(team: Team): string {
  const cap = (team as any).captain
  return cap?.ingame_name || cap?.discord_username || team.name
}
function pickDisplayName(pick: DraftPick): string {
  return pick.user?.ingame_name || pick.user?.discord_username || '?'
}

export default function DraftPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const eventId = params.id

  const [event, setEvent] = useState<Event | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [signups, setSignups] = useState<Signup[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmPlayer, setConfirmPlayer] = useState<Signup | null>(null)
  const [classFilter, setClassFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [picking, setPicking] = useState(false)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [darkMode, setDarkMode] = useState(true)
  const [timerOn, setTimerOn] = useState(true)
  const [timerSecs, setTimerSecs] = useState(90)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [classPickerFor, setClassPickerFor] = useState<{ userId: string; pickId: string; name: string } | null>(null)
  const [pickerSelected, setPickerSelected] = useState<string[]>([])
  const [teamContextMenu, setTeamContextMenu] = useState<{ x: number; y: number; team: Team } | null>(null)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editingTeamName, setEditingTeamName] = useState('')
  const [teamNames, setTeamNames] = useState<Record<string, string>>({})
  // FIX: track if "End Draft" confirm is showing
  const [endDraftConfirm, setEndDraftConfirm] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const timerSecsRef = useRef(90)

  const isAdmin = !!(session?.user?.isOrganizer || (session?.user as any)?.isSuperUser)
  const myUserId = session?.user?.userId

  useEffect(() => {
    try {
      const saved = localStorage.getItem('draftman-theme')
      setDarkMode(saved === 'slate')
    } catch(e) {}
  }, [])

  const fetchAll = useCallback(async () => {
    try {
      const [evRes, teamsRes, picksRes, signupsRes] = await Promise.all([
        fetch(`/api/events/${eventId}`),
        fetch(`/api/events/${eventId}/teams`),
        fetch(`/api/draft/${eventId}/picks`),
        fetch(`/api/events/${eventId}/signups`),
      ])
      if (evRes.ok) { const d = await evRes.json(); setEvent(d.event ?? d) }
      if (teamsRes.ok) { const d = await teamsRes.json(); const arr = d?.teams ?? d; setTeams(Array.isArray(arr) ? arr : []) }
      if (picksRes.ok) { const d = await picksRes.json(); setPicks(Array.isArray(d) ? d : []) }
      if (signupsRes.ok) { const d = await signupsRes.json(); setSignups(Array.isArray(d) ? d : []) }
    } catch (e) { console.error('fetchAll error', e) }
    finally { setLoading(false) }
  }, [eventId])

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
    if (status === 'authenticated') setTimeout(fetchAll, 300)
  }, [status, fetchAll, router])

  useEffect(() => {
    const channel = supabase
      .channel(`draft-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `event_id=eq.${eventId}` }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, fetchAll])

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

  useEffect(() => {
    const handler = () => { setContextMenu(null); setTeamContextMenu(null) }
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  function resetTimer() { timerSecsRef.current = 90; setTimerSecs(90) }

  const sortedTeams = Array.isArray(teams)
    ? [...teams].sort((a, b) => (a.pick_order ?? 0) - (b.pick_order ?? 0))
    : []

  const totalPicks = sortedTeams.length * SLOTS_PER_TEAM
  const currentPickNum = picks.length + 1
  const isDraftDone = picks.length >= totalPicks && totalPicks > 0

  function getActiveTeamIdx(): number {
    if (isDraftDone || sortedTeams.length === 0) return -1
    const round = Math.floor(picks.length / sortedTeams.length)
    const pos = picks.length % sortedTeams.length
    return round % 2 === 0 ? pos : sortedTeams.length - 1 - pos
  }

  const activeTeamIdx = getActiveTeamIdx()
  const activeTeam = activeTeamIdx >= 0 ? sortedTeams[activeTeamIdx] : null
  const canPick = isAdmin || (activeTeam?.captain_id === myUserId)

  function teamPicks(teamId: string) {
    return picks.filter(p => p.team_id === teamId).sort((a, b) => a.pick_number - b.pick_number)
  }

  const pickedIds = new Set(picks.map(p => p.user_id))
  const captainIds = new Set(sortedTeams.map(t => t.captain_id).filter(Boolean))

  // Per-team slot tracking for active team
  const activeTeamSlots: Record<string, number> = {
    rifle:  (event as any)?.slots_rifle  ?? 0,
    third:  (event as any)?.slots_third  ?? 0,
    heavy:  (event as any)?.slots_heavy  ?? 0,
    sniper: (event as any)?.slots_sniper ?? 0,
    flex:   99,
  }
  const activeTeamDrafted: Record<string, number> = { rifle: 0, third: 0, heavy: 0, sniper: 0, flex: 0 }
  if (activeTeam) {
    for (const pick of picks.filter(p => p.team_id === activeTeam.id)) {
      const cls = pick.class || 'flex'
      if (activeTeamDrafted[cls] !== undefined) activeTeamDrafted[cls]++
    }
  }
  function isClassFullForActiveTeam(cls: string): boolean {
    if (cls === 'flex') return false
    return activeTeamSlots[cls] > 0 && activeTeamDrafted[cls] >= activeTeamSlots[cls]
  }
  function playerHasOpenSlot(playerClasses: string[]): boolean {
    if (playerClasses.includes('flex')) return true
    return playerClasses.some(cls => !isClassFullForActiveTeam(cls))
  }

  // Global slot counts for filter button visibility
  const numTeams = sortedTeams.length || 1
  const slotCounts: Record<string, number> = {
    rifle:  ((event as any)?.slots_rifle  ?? 0) * numTeams,
    third:  ((event as any)?.slots_third  ?? 0) * numTeams,
    heavy:  ((event as any)?.slots_heavy  ?? 0) * numTeams,
    sniper: ((event as any)?.slots_sniper ?? 0) * numTeams,
    flex:   9999,
  }
  const draftedClassCounts: Record<string, number> = { rifle: 0, third: 0, heavy: 0, sniper: 0, flex: 0 }
  for (const pick of picks) {
    const cls = pick.class || 'flex'
    if (draftedClassCounts[cls] !== undefined) draftedClassCounts[cls]++
  }
  function isClassFull(cls: string): boolean {
    if (cls === 'all' || cls === 'flex') return false
    return slotCounts[cls] > 0 && draftedClassCounts[cls] >= slotCounts[cls]
  }

  const available = signups.filter(s => {
    if (pickedIds.has(s.user_id) || captainIds.has(s.user_id)) return false
    const name = playerDisplayName(s).toLowerCase()
    if (search && !name.includes(search.toLowerCase())) return false
    if (classFilter !== 'all' && !s.class.includes(classFilter)) return false
    // Hide players whose classes are all full for the active team
    if (activeTeam && !playerHasOpenSlot(s.class)) return false
    return true
  })

  async function confirmPick() {
    if (!selected || !activeTeam || !canPick || picking) return
    setPicking(true)
    const res = await fetch(`/api/draft/${eventId}/picks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selected, team_id: activeTeam.id, pick_number: currentPickNum }),
    })
    setPicking(false)
    if (res.ok) { setSelected(null); resetTimer(); showToast('Pick confirmed') }
    else { const d = await res.json(); showToast(d.error || 'Pick failed', true) }
  }

  // FIX: undoPick always removes the last pick in DB order.
  // selected and confirmPlayer are cleared so no phantom extra pick button appears.
  async function undoPick() {
    if (!isAdmin || picks.length === 0) return
    const res = await fetch(`/api/draft/${eventId}/undo`, { method: 'DELETE' })
    if (res.ok) {
      setSelected(null)
      setConfirmPlayer(null)  // FIX: clear confirm modal state
      resetTimer()
      showToast('Pick undone')
      // fetchAll is triggered by realtime subscription, but call it explicitly as fallback
      fetchAll()
    } else {
      showToast('Undo failed', true)
    }
  }

  // FIX: undoSpecificPick from context menu.
  // Only allowed if the right-clicked pick IS the last pick.
  // If it's not the last pick, warn the admin instead of silently undoing the wrong one.
  async function undoSpecificPick(pickId: string, pickNumber: number) {
    if (!isAdmin) return
    setContextMenu(null)

    const lastPick = picks.reduce((max, p) => p.pick_number > max.pick_number ? p : max, picks[0])
    if (lastPick.id !== pickId) {
      showToast('Can only undo the last pick. Use the ↩ Undo button.', true)
      return
    }

    const res = await fetch(`/api/draft/${eventId}/undo`, { method: 'DELETE' })
    if (res.ok) {
      setSelected(null)
      setConfirmPlayer(null)
      resetTimer()
      showToast('Pick undone')
      fetchAll()
    } else {
      showToast('Undo failed', true)
    }
  }

  async function endDraft() {
    setEndDraftConfirm(false)
    router.push(`/events/${eventId}/tournament-setup`)
  }

  async function changePickClass(pickId: string, newClasses: string[]) {
    setClassPickerFor(null)
    setPickerSelected([])
    const res = await fetch(`/api/draft/${eventId}/picks/${pickId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class: newClasses[0] || 'flex' }),
    })
    if (res.ok) { showToast('Class updated'); fetchAll() }
    else showToast('Failed to update class', true)
  }

  async function changeSignupClass(userId: string, newClasses: string[]) {
    setClassPickerFor(null)
    setPickerSelected([])
    const signup = signups.find(s => s.user_id === userId)
    if (!signup) return
    const res = await fetch(`/api/events/${eventId}/signups/${signup.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class: newClasses }),
    })
    if (res.ok) { showToast('Class updated'); fetchAll() }
    else showToast('Failed to update class', true)
  }

  async function toggleRinger(userId: string) {
    setContextMenu(null)
    const signup = signups.find(s => s.user_id === userId)
    if (!signup) return
    const res = await fetch(`/api/events/${eventId}/signups/${signup.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ringer: !signup.ringer }),
    })
    if (res.ok) { showToast(signup.ringer ? 'Removed ringer' : 'Marked as ringer'); fetchAll() }
    else showToast('Failed', true)
  }

  async function saveTeamName(teamId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingTeamId(null); return }
    setTeamNames(prev => ({ ...prev, [teamId]: trimmed }))
    setEditingTeamId(null)
    await fetch(`/api/events/${eventId}/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    fetchAll()
  }

  // NATO names — default team names before rename
  const NATO = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel','India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa']

  function getTeamDisplayName(team: Team): string {
    const overridden = teamNames[team.id]
    if (overridden) return overridden
    if (NATO.includes(team.name)) return captainDisplayName(team)
    return team.name || captainDisplayName(team)
  }

  function isTeamRenamed(team: Team): boolean {
    const overridden = teamNames[team.id]
    if (overridden) return overridden !== captainDisplayName(team)
    return !NATO.includes(team.name) && !!team.name && team.name !== captainDisplayName(team)
  }

  function showToast(msg: string, err = false) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 2500)
  }

  function toggleTheme() {
    const next = !darkMode
    document.documentElement.setAttribute('data-theme', next ? 'slate' : '')
    localStorage.setItem('draftman-theme', next ? 'slate' : 'light')
    setDarkMode(next)
  }

  function handleContextMenu(
    e: React.MouseEvent,
    userId: string,
    name: string,
    isDrafted: boolean,
    pickId?: string,
    pickNumber?: number,
    currentClass?: string | null,
    isRinger?: boolean
  ) {
    if (!isAdmin) return
    e.preventDefault()
    e.stopPropagation()
    const signup = signups.find(s => s.user_id === userId)
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      userId,
      name,
      isDrafted,
      pickId,
      pickNumber,
      currentClass,
      isRinger: isRinger ?? signup?.ringer ?? false,
    })
  }

  const twoCol = picks.length >= 20

  function renderTeamRows() {
    if (sortedTeams.length === 0) return null
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

  // FIX: pass pickNumber into context menu handler so undoSpecificPick can validate
  function renderTeamCol(team: Team, idx: number) {
    const isActive = idx === activeTeamIdx
    const tp = teamPicks(team.id)
    return (
      <div key={team.id} style={{
        flex: 1, minWidth: 90, background: 'var(--surface)',
        border: `1px solid ${isActive ? 'var(--khaki)' : 'var(--border)'}`,
        boxShadow: isActive ? '0 0 0 1px rgba(200,184,122,0.12)' : 'none',
        borderRadius: 4, overflow: 'hidden', transition: 'border-color 0.2s',
      }}>
        <div
          style={{ padding: '6px 8px 5px', borderBottom: '1px solid var(--border)', cursor: isAdmin ? 'context-menu' : 'default' }}
          onContextMenu={e => {
            if (!isAdmin) return
            e.preventDefault()
            e.stopPropagation()
            setTeamContextMenu({ x: e.clientX, y: e.clientY, team })
          }}
        >
          <div style={{ height: 2, borderRadius: 1, background: team.color, marginBottom: 4 }} />
          {editingTeamId === team.id ? (
            <input
              autoFocus
              value={editingTeamName}
              onChange={e => setEditingTeamName(e.target.value)}
              onBlur={() => saveTeamName(team.id, editingTeamName)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveTeamName(team.id, editingTeamName)
                if (e.key === 'Escape') setEditingTeamId(null)
              }}
              style={{
                width: '100%', background: 'var(--surface2)',
                border: '1px solid var(--khaki)', borderRadius: 3,
                color: 'var(--text)', fontSize: 13, padding: '2px 4px',
                fontFamily: 'var(--font-body)', outline: 'none',
              }}
            />
          ) : (
            <div
              onClick={() => {
                if (!isAdmin) return
                setEditingTeamId(team.id)
                setEditingTeamName(getTeamDisplayName(team))
              }}
              style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: isAdmin ? 'text' : 'default' }}
              title={isAdmin ? 'Click to rename' : ''}
            >
              {getTeamDisplayName(team)}
              {isTeamRenamed(team) ? (
                <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>({captainDisplayName(team)})</span>
              ) : (
                <span style={{ color: 'var(--khaki)', fontSize: 9, marginLeft: 4 }}>♛</span>
              )}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? 'var(--khaki)' : 'var(--text-dim)', marginTop: 1 }}>
            {isActive ? 'Picking now ▸' : `Pick ${team.pick_order}`}
          </div>
        </div>
        <div style={{ padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Array.from({ length: SLOTS_PER_TEAM }).map((_, si) => {
            const pick = tp[si]
            if (pick) {
              const cls = pick.class || 'flex'
              return (
                <div
                  key={si}
                  onContextMenu={e => handleContextMenu(e, pick.user_id, pickDisplayName(pick), true, pick.id, pick.pick_number, pick.class)}
                  style={{ height: 26, borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6, fontSize: 13, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: isAdmin ? 'context-menu' : 'default' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR[cls] || 'var(--flex)', flexShrink: 0 }} />
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pickDisplayName(pick)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{CLS_SHORT[cls] || 'Fx'}</span>
                </div>
              )
            }
            return (
              <div key={si} style={{ height: 26, borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 8px', border: '1px dashed rgba(200,184,122,0.08)' }}>
                <span style={{ fontSize: 11, color: 'rgba(160,152,128,0.25)' }}>empty</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderPool() {
    const classes = ['rifle', 'third', 'heavy', 'sniper', 'flex']
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
            const isSel = selected === s.user_id
            return (
              <div
                key={s.user_id}
                onClick={() => { if (!canPick) return; setSelected(isSel ? null : s.user_id); if (!isSel) setConfirmPlayer(s) }}
                onContextMenu={e => handleContextMenu(e, s.user_id, playerDisplayName(s), false, undefined, undefined, undefined, s.ringer)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 3, fontSize: 14, background: isSel ? 'rgba(200,184,122,0.1)' : 'var(--surface2)', border: `1px solid ${isSel ? 'var(--khaki)' : 'var(--border)'}`, cursor: canPick ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR[cls], flexShrink: 0 }} />
                <span style={{ color: 'var(--text)' }}>{playerDisplayName(s)}</span>
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
  const round = sortedTeams.length > 0 ? Math.floor(picks.length / sortedTeams.length) + 1 : 1

  // FIX: "Undo Pick" in context menu shows dimmed label if it's not the last pick
  const lastPickId = picks.length > 0
    ? picks.reduce((max, p) => p.pick_number > max.pick_number ? p : max, picks[0]).id
    : null

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
        {!isDraftDone && sortedTeams.length > 0 && (
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 2, border: '1px solid var(--khaki)', color: 'var(--khaki)', background: 'rgba(200,184,122,0.08)', marginLeft: 4, whiteSpace: 'nowrap' }}>
            Round {round} — Pick {currentPickNum}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/portal" style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', textDecoration: 'none' }}>Portal</Link>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div onClick={toggleTheme} style={{ width: 32, height: 18, borderRadius: 18, position: 'relative', cursor: 'pointer', background: 'rgba(200,184,122,0.2)', border: '1px solid var(--border-strong)', flexShrink: 0 }}>
            <div style={{ position: 'absolute', top: 2, left: darkMode ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: 'var(--khaki)', transition: 'left 0.2s' }} />
          </div>
          {session?.user?.discordId && session?.user?.discordAvatar
            ? <img src={`https://cdn.discordapp.com/avatars/${session.user.discordId}/${session.user.discordAvatar}.png`} style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border-strong)' }} alt="" />
            : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: 11, color: 'var(--khaki)' }}>
                {(session?.user?.ingameName || session?.user?.discordUsername || '?')[0].toUpperCase()}
              </div>
          }
          <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{session?.user?.ingameName || session?.user?.discordUsername}</span>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* PICK LOG */}
        <aside style={{ width: twoCol ? 360 : 200, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%', transition: 'width 0.3s' }}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Pick Log <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 11, color: 'var(--khaki)' }}>{picks.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ display: twoCol ? 'grid' : 'flex', gridTemplateColumns: twoCol ? '1fr 1fr' : undefined, flexDirection: twoCol ? undefined : 'column' }}>
              {[...picks].reverse().map(pick => (
                <div key={pick.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderBottom: '1px solid var(--border)', borderRight: twoCol ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 10, color: 'var(--text-dim)', width: 16, textAlign: 'right', flexShrink: 0 }}>{pick.pick_number}</span>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: sortedTeams.find(t => t.id === pick.team_id)?.color || 'var(--text-dim)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pickDisplayName(pick)}</span>
                  <span style={{ fontSize: 10, color: CLS_COLOR[pick.class || 'flex'] || 'var(--flex)', flexShrink: 0 }}>{CLS_SHORT[pick.class || 'flex'] || 'Fx'}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          <div style={{ height: 44, flexShrink: 0, background: 'rgba(200,184,122,0.04)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
            {!isDraftDone && activeTeam && (
              <>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTeam.color, animation: 'blink 1.4s infinite', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Now picking —</span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{captainDisplayName(activeTeam)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>&nbsp;· {activeTeam.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>{available.length} players remaining</span>
              </>
            )}
            {isDraftDone && <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 13, color: 'var(--green-light)', letterSpacing: '0.04em' }}>Draft complete</span>}
            {sortedTeams.length === 0 && !isDraftDone && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>No teams set up yet</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* FIX: Undo only shows when picks exist and draft not done */}
              {isAdmin && picks.length > 0 && !isDraftDone && (
                <button onClick={undoPick} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--rust)', color: 'var(--rust)', background: 'rgba(192,57,43,0.08)', cursor: 'pointer' }}>↩ Undo</button>
              )}
              <button onClick={() => setTimerOn(!timerOn)} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent', cursor: 'pointer' }}>
                {timerOn ? '⏸ Pause' : '▶ Resume'}
              </button>
              {/* START TOURNAMENT button */}
              {isAdmin && (
                <button
                  onClick={() => setEndDraftConfirm(true)}
                  style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 11px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent', cursor: 'pointer' }}
                >
                  Start Draft
                </button>
              )}
            </div>
          </div>

          <div style={{ flexShrink: 0, padding: '10px 12px 0', overflowX: 'auto' }}>
            {renderTeamRows()}
          </div>

          <div style={{ height: 36, flexShrink: 0, background: 'var(--surface2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 16px' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Time remaining</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 20, letterSpacing: '0.06em', color: timerUrgent ? 'var(--rust)' : 'var(--khaki)', minWidth: 50, textAlign: 'center', transition: 'color 0.3s' }}>{timerStr}</span>
            <div style={{ flex: 1, maxWidth: 220, height: 2, background: 'var(--surface)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: timerUrgent ? 'var(--rust)' : 'var(--khaki)', width: `${timerPct}%`, transition: 'width 1s linear, background 0.3s' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{timerOn ? 'Timer on' : 'Paused'}</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 36, flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Available Players</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 13, color: 'var(--khaki)' }}>{available.length}</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 10px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text)', outline: 'none', width: 150 }} />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {['all', 'rifle', 'third', 'heavy', 'sniper', 'flex'].filter(cls => !isClassFull(cls)).map(cls => (
                  <button key={cls} onClick={() => setClassFilter(cls)} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s', border: classFilter === cls ? '1px solid var(--khaki)' : '1px solid var(--border)', color: classFilter === cls ? 'var(--khaki)' : cls === 'all' ? 'var(--text-dim)' : CLS_COLOR[cls], background: classFilter === cls ? 'rgba(200,184,122,0.07)' : 'transparent' }}>{cls === 'all' ? 'All' : CLS_LABEL[cls]}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {renderPool()}
            </div>
          </div>
        </div>
      </div>

      {/* TEAM HEADER CONTEXT MENU */}
      {teamContextMenu && isAdmin && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.min(teamContextMenu.y, window.innerHeight - 120),
            left: Math.min(teamContextMenu.x, window.innerWidth - 200),
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            zIndex: 500,
            minWidth: 180,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{getTeamDisplayName(teamContextMenu.team)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>Team</div>
          </div>
          <CtxItem label="Rename Team" icon="✎" onClick={() => {
            setEditingTeamId(teamContextMenu.team.id)
            setEditingTeamName(getTeamDisplayName(teamContextMenu.team))
            setTeamContextMenu(null)
          }} />
          {teamContextMenu.team.captain_id && (
            <CtxItem label="View Captain Portal" icon="↗" onClick={() => {
              setTeamContextMenu(null)
              window.open(`/portal/${teamContextMenu.team.captain_id}`, '_blank')
            }} />
          )}
        </div>
      )}

      {/* RIGHT-CLICK CONTEXT MENU */}
      {contextMenu && isAdmin && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.min(contextMenu.y, window.innerHeight - 200),
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            zIndex: 500,
            minWidth: 180,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{contextMenu.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
              {contextMenu.isDrafted ? 'Drafted player' : 'Available player'}
            </div>
          </div>
          <CtxItem label="Change Class" icon="◎" onClick={() => {
            setClassPickerFor({ userId: contextMenu.userId, pickId: contextMenu.pickId || '', name: contextMenu.name })
            if (contextMenu.isDrafted && contextMenu.currentClass) {
              setPickerSelected([contextMenu.currentClass])
            } else {
              const signup = signups.find(s => s.user_id === contextMenu.userId)
              setPickerSelected(signup?.class || [])
            }
            setContextMenu(null)
          }} />
          {/* FIX: "Undo Pick" in context menu — only active if this IS the last pick */}
          {contextMenu.isDrafted && (
            <CtxItem
              label={contextMenu.pickId === lastPickId ? 'Undo Pick' : 'Undo Pick (use ↩ button)'}
              icon="↩"
              danger
              dimmed={contextMenu.pickId !== lastPickId}
              onClick={() => undoSpecificPick(contextMenu.pickId!, contextMenu.pickNumber!)}
            />
          )}
          <CtxItem
            label={contextMenu.isRinger ? 'Remove Ringer' : 'Mark as Ringer'}
            icon="◉"
            onClick={() => toggleRinger(contextMenu.userId)}
          />
          <CtxItem label="View Portal" icon="↗" onClick={() => { setContextMenu(null); window.open(`/portal/${contextMenu.userId}`, '_blank') }} />
        </div>
      )}

      {/* CLASS PICKER MODAL */}
      {classPickerFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }} onClick={() => { setClassPickerFor(null); setPickerSelected([]) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '24px 28px', minWidth: 300 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>Change Class</div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>{classPickerFor.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>
              Select up to 2 classes. Flex is exclusive.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {ALL_CLASSES.map(cls => {
                const isSel = pickerSelected.includes(cls)
                return (
                  <button
                    key={cls}
                    onClick={() => {
                      setPickerSelected(prev => {
                        if (prev.includes(cls)) return prev.filter(c => c !== cls)
                        if (cls === 'flex') return ['flex']
                        if (prev.includes('flex')) return [cls]
                        if (prev.length >= 2) return prev
                        return [...prev, cls]
                      })
                    }}
                    style={{
                      padding: '8px 16px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 12, fontFamily: 'var(--font-body)',
                      background: isSel ? `${CLS_COLOR[cls]}22` : 'transparent',
                      color: CLS_COLOR[cls],
                      border: `1px solid ${isSel ? CLS_COLOR[cls] : CLS_COLOR[cls] + '66'}`,
                    }}
                  >
                    {CLS_LABEL[cls]}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setClassPickerFor(null); setPickerSelected([]) }} style={{ fontSize: 11, color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, padding: '5px 14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Cancel</button>
              <button
                onClick={() => {
                  if (pickerSelected.length === 0) return
                  classPickerFor.pickId
                    ? changePickClass(classPickerFor.pickId, pickerSelected)
                    : changeSignupClass(classPickerFor.userId, pickerSelected)
                }}
                disabled={pickerSelected.length === 0}
                style={{
                  fontSize: 11, color: pickerSelected.length === 0 ? 'var(--text-dim)' : '#1a1a14',
                  background: pickerSelected.length === 0 ? 'transparent' : 'var(--khaki)',
                  border: '1px solid var(--khaki)', borderRadius: 3,
                  padding: '5px 14px', cursor: pickerSelected.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-body)', fontWeight: 600,
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setConfirmPlayer(null); setSelected(null) }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '28px 32px', minWidth: 300, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>Confirm Pick</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-heading)', fontWeight: 300, color: 'var(--text)', marginBottom: 6 }}>{playerDisplayName(confirmPlayer)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24 }}>
              {confirmPlayer.class.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' / ')}
              {activeTeam && <span> &nbsp;→&nbsp; {captainDisplayName(activeTeam)}</span>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setConfirmPlayer(null); setSelected(null) }} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => { setConfirmPlayer(null); confirmPick() }} disabled={picking} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3, border: '1px solid var(--green-light)', color: 'var(--green-light)', background: 'rgba(90,156,90,0.12)', cursor: 'pointer', opacity: picking ? 0.6 : 1 }}>✓ Confirm Pick</button>
            </div>
          </div>
        </div>
      )}

      {endDraftConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEndDraftConfirm(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: '28px 32px', minWidth: 300, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>Start Draft</div>
            <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 8 }}>Ready to move to draft?</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 24 }}>
              The draft will be locked and you'll be taken to group assignment. You can still undo picks before confirming.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEndDraftConfirm(false)} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
              <button onClick={endDraft} style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3, border: '1px solid var(--green-light)', color: 'var(--green-light)', background: 'rgba(90,156,90,0.12)', cursor: 'pointer' }}>Set Up Tournament →</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: `1px solid var(--border-strong)`, borderLeft: `3px solid ${toast.err ? 'var(--rust)' : 'var(--green-light)'}`, color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12, padding: '10px 16px', borderRadius: 3, zIndex: 999 }}>{toast.msg}</div>
      )}

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
    </div>
  )
}

function CtxItem({ label, icon, onClick, danger, dimmed }: { label: string; icon: string; onClick: () => void; danger?: boolean; dimmed?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', cursor: dimmed ? 'not-allowed' : 'pointer',
        background: hovered && !dimmed ? 'var(--surface2)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        color: dimmed ? 'var(--text-dim)' : danger ? 'var(--rust)' : 'var(--text)',
        fontSize: 12,
        opacity: dimmed ? 0.5 : 1,
      }}
    >
      <span style={{ width: 16, textAlign: 'center', color: dimmed ? 'var(--text-dim)' : danger ? 'var(--rust)' : 'var(--text-dim)', fontSize: 13 }}>{icon}</span>
      {label}
    </div>
  )
}
