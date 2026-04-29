'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { Topbar } from '@/components/Topbar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Team = { id: string; name: string; color: string }
type Match = {
  id: string; stage: string; round: number; match_number: number
  team1: Team | null; team2: Team | null; winner: Team | null
  score_team1: number | null; score_team2: number | null
  map: string | null; status: string; confirmed: boolean
  group_id: string | null; next_match_id: string | null
}
type Standing = {
  team_id: string; wins: number; losses: number
  points_for: number; points_against: number
  seed: number | null; seed_override: number | null
  teams: Team
}
type Group = { id: string; label: string }
type Tournament = {
  id: string; event_id: string; format: string; status: string
  num_groups: number; rounds_per_group: number
  champion_team_id: string | null
}

type CtxState = { x: number; y: number; type: string; match?: Match; standing?: Standing & { groupLabel: string } } | null
type ModalState = { type: string; match?: Match; standing?: Standing & { groupLabel: string } } | null

const STAGES = ['group', 'quarterfinal', 'semifinal', 'final']

export default function TournamentPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const isAdmin = (session?.user as any)?.isOrganizer || (session?.user as any)?.isSuperUser
  const isCaptain = (session?.user as any)?.isCaptain
  const canConfirm = isAdmin || isCaptain

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [eventName, setEventName] = useState<string>('')
  const [groups, setGroups] = useState<Group[]>([])
  const [groupTeams, setGroupTeams] = useState<any[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'rr' | 'bracket' | 'queue'>('rr')
  const [ctx, setCtx] = useState<CtxState>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const ctxRef = useRef<HTMLDivElement>(null)

  const [editWinner, setEditWinner] = useState('')
  const [editScore1, setEditScore1] = useState('')
  const [editScore2, setEditScore2] = useState('')
  const [editMap, setEditMap] = useState('')
  const [editW, setEditW] = useState('')
  const [editL, setEditL] = useState('')
  const [editPF, setEditPF] = useState('')
  const [editPA, setEditPA] = useState('')
  const [editSeed, setEditSeed] = useState('')
  const [rejectNote, setRejectNote] = useState('')

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Fetch directly from Supabase — bypasses Railway caching entirely
  const fetchData = useCallback(async () => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: t } = await sb
      .from('tournaments')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle()

    const { data: ev } = await sb
      .from('events')
      .select('name')
      .eq('id', eventId)
      .maybeSingle()
    if (ev?.name) setEventName(ev.name)
    if (!t) { setLoading(false); return }

    const { data: grps } = await sb.from('tournament_groups').select('*').eq('tournament_id', t.id).order('label')
    const groupIds = (grps ?? []).map((g: any) => g.id)

    const [
      { data: grpTeams },
      { data: mtchs },
      { data: stndgs },
    ] = await Promise.all([
      sb.from('tournament_group_teams').select('*, teams(id, name, color)').in('group_id', groupIds),
      sb.from('tournament_matches').select('*, team1:team1_id(id, name, color), team2:team2_id(id, name, color), winner:winner_id(id, name, color)').eq('tournament_id', t.id).order('stage').order('round').order('match_number'),
      sb.from('tournament_standings').select('*, teams(id, name, color)').eq('tournament_id', t.id).order('wins', { ascending: false }).order('points_for', { ascending: false }),
    ])

    setTournament(t)
    setGroups(grps ?? [])
    setGroupTeams(grpTeams ?? [])
    setMatches(mtchs ?? [])
    setStandings(stndgs ?? [])
    setLoading(false)
  }, [eventId])

  useEffect(() => { fetchData() }, [fetchData])

  // Realtime subscriptions
  useEffect(() => {
    if (!tournament) return
    const matchSub = supabase
      .channel('tournament-matches')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournament_matches',
        filter: `tournament_id=eq.${tournament.id}`
      }, () => fetchData())
      .subscribe()
    const standingSub = supabase
      .channel('tournament-standings')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournament_standings',
        filter: `tournament_id=eq.${tournament.id}`
      }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(matchSub); supabase.removeChannel(standingSub) }
  }, [tournament, fetchData])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtx(null)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCtx(null); setModal(null) } }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc) }
  }, [])

  async function patchMatch(matchId: string, body: object) {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournament!.id}/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error', true); return false }
    await fetchData()
    return true
  }

  async function confirmMatch(match: Match) {
    const ok = await patchMatch(match.id, { action: 'confirm' })
    if (ok) showToast(`${match.team1?.name ?? ''} vs ${match.team2?.name ?? ''} confirmed`)
  }

  async function rejectMatch(match: Match, note: string) {
    const ok = await patchMatch(match.id, { action: 'reject', note })
    if (ok) showToast('Result rejected — match reset to pending')
    setModal(null)
  }

  async function editMatch(match: Match) {
    const winnerIsTeam1 = editWinner === match.team1?.name
    const winner = winnerIsTeam1 ? match.team1?.id : match.team2?.id
    const winnerScore = parseInt(editScore1) || 0
    const loserScore = parseInt(editScore2) || 0
    const score_team1 = winnerIsTeam1 ? winnerScore : loserScore
    const score_team2 = winnerIsTeam1 ? loserScore : winnerScore
    const ok = await patchMatch(match.id, {
      action: 'edit',
      winner_id: winner,
      score_team1,
      score_team2,
      map: editMap || match.map,
    })
    if (ok) { showToast('Match updated'); setModal(null) }
  }

  async function editStanding(s: Standing) {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournament!.id}/standings/${s.team_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wins: parseInt(editW),
        losses: parseInt(editL),
        points_for: parseInt(editPF),
        points_against: parseInt(editPA),
        seed_override: editSeed ? parseInt(editSeed) : null,
      }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error', true); return }
    showToast('Standing updated')
    setModal(null)
    await fetchData()
  }

  async function seedPlayoffs() {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournament!.id}/seed-playoffs`, { method: 'POST' })
    setSaving(false)
    if (!res.ok) { showToast('Failed to seed playoffs', true); return }
    showToast('Playoffs seeded!')
    await fetchData()
  }

  async function declareChampion() {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournament!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'declare_champion' }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error', true); return }
    const d = await res.json()
    showToast(`${d.champion?.name ?? 'Champion'} declared winner!`)
    setModal(null)
    await fetchData()
  }

  function openCtx(e: React.MouseEvent, type: string, match?: Match, standing?: any) {
    e.preventDefault()
    const x = Math.min(e.clientX, window.innerWidth - 230)
    const y = Math.min(e.clientY, window.innerHeight - 280)
    setCtx({ x, y, type, match, standing })
  }

  function openModal(type: string, match?: Match, standing?: any) {
    setCtx(null)
    if (match) {
      setEditWinner(match.winner?.name ?? match.team1?.name ?? '')
      setEditScore1(match.score_team1?.toString() ?? '')
      setEditScore2(match.score_team2?.toString() ?? '')
      setEditMap(match.map ?? '')
    }
    if (standing) {
      setEditW(standing.wins.toString())
      setEditL(standing.losses.toString())
      setEditPF(standing.points_for.toString())
      setEditPA(standing.points_against.toString())
      setEditSeed(standing.seed_override?.toString() ?? '')
    }
    setModal({ type, match, standing })
  }

  const groupMatches = matches.filter(m => m.stage === 'group')
  const playoffMatches = matches.filter(m => m.stage !== 'group')
  const awaitingConfirmation = matches.filter(m => m.status === 'awaiting_confirmation')

  function getGroupStandings(groupId: string) {
    return standings
      .filter(s => {
        const gt = groupTeams.find((gt: any) => gt.team_id === s.team_id && gt.group_id === groupId)
        return !!gt
      })
      .sort((a, b) => {
        const wDiff = b.wins - a.wins
        if (wDiff !== 0) return wDiff
        return (b.points_for - b.points_against) - (a.points_for - a.points_against)
      })
  }

  function getGroupMatches(groupId: string) {
    return groupMatches
      .filter(m => m.group_id === groupId)
      .sort((a, b) => a.round - b.round || a.match_number - b.match_number)
  }

  function groupRounds(groupId: string) {
    const ms = getGroupMatches(groupId)
    const rounds: Record<number, Match[]> = {}
    for (const m of ms) {
      if (!rounds[m.round]) rounds[m.round] = []
      rounds[m.round].push(m)
    }
    return rounds
  }

  function getStageMatches(stage: string) {
    return playoffMatches
      .filter(m => m.stage === stage)
      .sort((a, b) => a.match_number - b.match_number)
  }

  const diff = (s: Standing) => s.points_for - s.points_against

  const S: Record<string, React.CSSProperties> = {
    page: { padding: '32px 24px', maxWidth: 1300, margin: '0 auto' },
    header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' },
    title: { fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, letterSpacing: 4, color: 'var(--khaki)' },
    sub: { fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 2, marginTop: 4 },
    statusBar: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '14px 20px', marginBottom: 28, display: 'flex', gap: 32, flexWrap: 'wrap' },
    stat: { display: 'flex', flexDirection: 'column', gap: 3 },
    statVal: { fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, color: 'var(--khaki)' },
    statLabel: { fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)' },
    tabs: { display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 28 },
    groupsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 36 },
    groupBlock: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' },
    groupHeader: { padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
    th: { fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, whiteSpace: 'nowrap' as const, borderBottom: '1px solid var(--border-strong)' },
    thNum: { textAlign: 'right' as const },
    td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' as const },
    tdNum: { textAlign: 'right' as const, fontSize: 13, fontWeight: 600 },
    roundNameBar: { padding: '7px 16px', fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)' },
    roundMatch: { display: 'flex', alignItems: 'center', padding: '9px 16px', borderTop: '1px solid var(--border)', gap: 8, cursor: 'context-menu', position: 'relative' as const },
    matchCard: { margin: '8px 16px', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: 'var(--surface)', position: 'relative' as const, cursor: 'context-menu' },
    matchTeam: { display: 'flex', alignItems: 'center', padding: '9px 12px', gap: 8, borderBottom: '1px solid var(--border)' },
    matchMap: { fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', padding: '4px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' },
    unconfBar: { background: 'rgba(200,132,42,0.1)', borderBottom: '1px solid rgba(200,132,42,0.25)', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    badge: { fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1.5, padding: '3px 8px', borderRadius: 3, fontWeight: 600 },
    btn: { fontFamily: 'var(--font-heading)', fontSize: 12, letterSpacing: 2, padding: '8px 18px', borderRadius: 3, cursor: 'pointer', border: 'none', fontWeight: 600 },
    btnPrimary: { background: 'var(--khaki)', color: 'var(--bg)' },
    btnGhost: { background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)' },
    btnDanger: { background: 'transparent', color: 'var(--rust)', border: '1px solid rgba(192,57,43,0.3)' },
    btnChampion: { background: 'rgba(200,184,122,0.15)', color: 'var(--khaki)', border: '1px solid rgba(200,184,122,0.5)' },
    btnSmConfirm: { fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 2, border: 'none', background: 'var(--khaki)', color: 'var(--bg)', cursor: 'pointer', fontWeight: 700 },
    btnSmReject: { fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: 1.5, padding: '3px 10px', borderRadius: 2, border: '1px solid rgba(192,57,43,0.4)', background: 'transparent', color: 'var(--rust)', cursor: 'pointer', fontWeight: 600 },
    ctxMenu: { position: 'fixed' as const, zIndex: 999, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 5, minWidth: 210, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden' },
    ctxHeader: { padding: '8px 14px 6px', fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' },
    ctxItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', fontFamily: 'var(--font-heading)', fontSize: 12, letterSpacing: 1, color: 'var(--text)', cursor: 'pointer', width: '100%', background: 'none', border: 'none', textAlign: 'left' as const },
    modalBackdrop: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    modal: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, padding: 28, width: 420, maxWidth: '90vw' },
    modalTitle: { fontFamily: 'var(--font-heading)', fontSize: 14, letterSpacing: 3, color: 'var(--khaki)', marginBottom: 4, fontWeight: 700 },
    modalSub: { fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 20 },
    modalLabel: { fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 1.5, color: 'var(--text-dim)', marginBottom: 6, display: 'block' },
    modalInput: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--font-heading)', fontSize: 13, letterSpacing: 1 },
    modalWarning: { fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--amber)', marginBottom: 16, padding: '8px 12px', border: '1px solid rgba(200,132,42,0.25)', borderRadius: 3, background: 'rgba(200,132,42,0.05)' },
    modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 },
    championConfirm: { textAlign: 'center' as const, padding: '20px 0' },
    bracketWrap: { overflowX: 'auto' as const, paddingBottom: 24 },
    bracket: { display: 'flex', alignItems: 'stretch', minWidth: 'fit-content' },
    bRound: { display: 'flex', flexDirection: 'column' as const, minWidth: 230 },
    bRoundLabel: { fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textAlign: 'center' as const, padding: '0 16px 16px', borderBottom: '1px solid var(--border)' },
    bRoundMatches: { display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-around', flex: 1, padding: '16px 0' },
    connectors: { width: 40, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-around', flex: 1, padding: '16px 0' },
    championCard: { margin: '8px 16px', border: '1px solid var(--khaki)', borderRadius: 4, background: 'rgba(200,184,122,0.05)', padding: '20px 16px', textAlign: 'center' as const },
    queueCard: { background: 'var(--surface)', border: '1px solid rgba(200,132,42,0.4)', borderRadius: 4, padding: '16px 20px', marginBottom: 12 },
    toast: { position: 'fixed' as const, bottom: 24, right: 24, zIndex: 600, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '12px 20px', fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: 1, color: 'var(--text)' },
  }

  function Tab({ id, label, count }: { id: 'rr' | 'bracket' | 'queue'; label: string; count?: number }) {
    const active = tab === id
    return (
      <button onClick={() => setTab(id)} style={{
        fontFamily: 'var(--font-heading)', fontSize: 12, letterSpacing: 2, padding: '10px 24px',
        cursor: 'pointer', color: active ? 'var(--khaki)' : 'var(--text-dim)',
        borderBottom: active ? '2px solid var(--khaki)' : '2px solid transparent',
        marginBottom: -1, background: 'none', border: 'none', borderBottomStyle: 'solid',
        borderBottomWidth: 2, borderBottomColor: active ? 'var(--khaki)' : 'transparent',
        fontWeight: 600, position: 'relative',
      }}>
        {label}
        {count ? <span style={{ marginLeft: 6, background: 'var(--amber)', color: 'var(--bg)', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10 }}>{count}</span> : null}
      </button>
    )
  }

  function MatchCard({ match, showGroupBadge = false }: { match: Match; showGroupBadge?: boolean }) {
    const unconf = match.status === 'awaiting_confirmation'
    const complete = match.status === 'complete'
    const live = match.status === 'in_progress'

    const cardBorder = unconf ? '1px solid rgba(200,132,42,0.5)'
      : complete ? '1px solid rgba(200,184,122,0.25)'
      : live ? '1px solid var(--amber)'
      : '1px solid var(--border)'

    return (
      <div
        onContextMenu={e => openCtx(e, unconf ? 'match-unconf' : complete ? 'match-complete' : live ? 'match-live' : 'match-pending', match)}
        style={{ ...S.matchCard, border: cardBorder, boxShadow: live ? '0 0 12px rgba(200,132,42,0.1)' : undefined }}
      >
        {unconf && canConfirm && (
          <div style={S.unconfBar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', animation: 'pulse 1.4s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--amber)', fontWeight: 700 }}>UNCONFIRMED</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={S.btnSmReject} onClick={e => { e.stopPropagation(); openModal('reject', match) }}>REJECT</button>
              <button style={S.btnSmConfirm} onClick={e => { e.stopPropagation(); confirmMatch(match) }}>CONFIRM</button>
            </div>
          </div>
        )}

        {[match.team1, match.team2].map((team, i) => {
          const score = i === 0 ? match.score_team1 : match.score_team2
          const isWinner = complete && team?.id === match.winner?.id
          const isLoser = complete && team?.id !== match.winner?.id
          const groupLabel = showGroupBadge ? groups.find(g => groupTeams.find((gt: any) => gt.team_id === team?.id && gt.group_id === g.id))?.label : null
          return (
            <div key={i} style={{
              ...S.matchTeam,
              background: isWinner ? 'rgba(200,184,122,0.06)' : undefined,
              opacity: isLoser ? 0.5 : 1,
              borderBottom: i === 0 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ width: 3, height: 26, borderRadius: 2, background: team?.color ?? 'var(--border)', flexShrink: 0 }} />
              {groupLabel && <span style={{ fontFamily: 'var(--font-body)', fontSize: 8, letterSpacing: 1, padding: '1px 5px', borderRadius: 2, fontWeight: 700, background: groupLabel === 'A' ? 'rgba(74,122,191,0.2)' : 'rgba(184,92,56,0.2)', color: groupLabel === 'A' ? '#4a7abf' : '#b85c38', flexShrink: 0 }}>{groupLabel}{i === 0 ? (match.stage === 'quarterfinal' && match.match_number <= 2 ? (match.match_number === 1 ? '1' : '2') : '') : ''}</span>}
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 12, fontWeight: 600, letterSpacing: 1, flex: 1, color: team ? 'var(--text)' : 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? 'TBD'}</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700, minWidth: 32, textAlign: 'right', color: isWinner ? 'var(--khaki)' : unconf ? 'rgba(200,132,42,0.7)' : 'var(--text-dim)' }}>{score ?? '—'}</span>
            </div>
          )
        })}
        <div style={S.matchMap}>
          {match.map
            ? `${match.map}${live ? ' · LIVE' : ''}`
            : complete
              ? (match.confirmed ? 'CONFIRMED' : 'COMPLETE')
              : unconf
                ? 'AWAITING CONFIRMATION'
                : live
                  ? 'LIVE'
                  : 'PENDING'}
        </div>
      </div>
    )
  }

  function Connectors({ count }: { count: number }) {
    return (
      <div style={{ width: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, padding: '16px 0' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'absolute', right: 0, top: '25%', height: '50%', width: 1, background: 'var(--border-strong)' }} />
            <div style={{ position: 'absolute', right: 0, top: '50%', width: 20, height: 1, background: 'var(--border-strong)' }} />
          </div>
        ))}
      </div>
    )
  }

  if (loading) return (
    <div>
      <Topbar items={[{ label: 'Events', href: '/dashboard' }, { label: 'Event', href: `/events/${eventId}` }, { label: 'Draft', href: '#' }]} />
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>Loading...</div>
    </div>
  )

  if (!tournament) return (
    <div>
      <Topbar items={[{ label: 'Events', href: '/dashboard' }, { label: 'Event', href: `/events/${eventId}` }, { label: 'Draft', href: '#' }]} />
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 16 }}>NO DRAFT FOUND</div>
        {isAdmin && <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => router.push(`/events/${eventId}/tournament/setup`)}>CREATE DRAFT</button>}
      </div>
    </div>
  )

  const qfMatches = getStageMatches('quarterfinal')
  const sfMatches = getStageMatches('semifinal')
  const finalMatches = getStageMatches('final')

  // Champion: declared (locked in) vs pending (final complete but not yet declared)
  const declaredChampion = tournament.champion_team_id
    ? (finalMatches[0]?.winner?.id === tournament.champion_team_id ? finalMatches[0].winner : null)
    : null
  const pendingChampion = !tournament.champion_team_id && finalMatches[0]?.status === 'complete' && finalMatches[0]?.winner
    ? finalMatches[0].winner
    : null
  const champion = declaredChampion ?? (finalMatches[0]?.winner ?? null)

  // Show declare button when: admin, final is complete, champion not yet declared
  const showDeclareButton = isAdmin && pendingChampion && !tournament.champion_team_id

  return (
    <div>
      <Topbar items={[{ label: 'Events', href: '/dashboard' }, { label: 'Event', href: `/events/${eventId}` }, { label: 'Draft', href: '#' }]} />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={S.page}>
        <div style={S.header}>
          <div>
            <div style={S.title}>DRAFT{eventName ? ` · ${eventName}` : ''}</div>
            <div style={S.sub}>{groups.length} GROUPS · ROUND ROBIN + PLAYOFFS</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {awaitingConfirmation.length > 0 && (
              <span style={{ ...S.badge, background: 'rgba(200,132,42,0.15)', color: 'var(--amber)', border: '1px solid rgba(200,132,42,0.3)' }}>
                {awaitingConfirmation.length} PENDING
              </span>
            )}
            {showDeclareButton && (
              <button style={{ ...S.btn, ...S.btnChampion }} onClick={() => openModal('declare-champion')} disabled={saving}>
                🏆 DECLARE CHAMPION
              </button>
            )}
            {isAdmin && (
              <button style={{ ...S.btn, ...S.btnGhost }} onClick={seedPlayoffs} disabled={saving}>
                SEED PLAYOFFS
              </button>
            )}
          </div>
        </div>

        <div style={S.statusBar}>
          <div style={S.stat}><div style={S.statVal}>{groups.length}</div><div style={S.statLabel}>GROUPS</div></div>
          <div style={S.stat}><div style={S.statVal}>{tournament.rounds_per_group}</div><div style={S.statLabel}>RR ROUNDS</div></div>
          <div style={S.stat}><div style={S.statVal}>{matches.filter(m => m.status === 'complete').length}</div><div style={S.statLabel}>COMPLETE</div></div>
          <div style={S.stat}><div style={S.statVal}>{awaitingConfirmation.length}</div><div style={S.statLabel}>UNCONFIRMED</div></div>
          <div style={S.stat}><div style={S.statVal}>{matches.filter(m => m.status === 'in_progress').length}</div><div style={S.statLabel}>LIVE</div></div>
          <div style={S.stat}>
            <div style={S.statVal}>{tournament.champion_team_id ? 'COMPLETE' : 'ACTIVE'}</div>
            <div style={S.statLabel}>STATUS</div>
          </div>
        </div>

        <div style={S.tabs}>
          <Tab id="rr" label="ROUND ROBIN" />
          <Tab id="bracket" label="PLAYOFF BRACKET" />
          <Tab id="queue" label="CONFIRM QUEUE" count={awaitingConfirmation.length || undefined} />
        </div>

        {tab === 'rr' && (
          <div>
            <div style={S.groupsRow}>
              {groups.map(g => {
                const gStandings = getGroupStandings(g.id)
                const gRounds = groupRounds(g.id)
                const accentColor = g.label === 'A' ? '#4a7abf' : '#b85c38'
                return (
                  <div key={g.id} style={S.groupBlock}>
                    <div style={S.groupHeader}>
                      <div style={{ width: 3, height: 20, borderRadius: 2, background: accentColor }} />
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700, letterSpacing: 3, color: accentColor }}>GROUP {g.label}</span>
                    </div>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          <th style={S.th}>#</th>
                          <th style={S.th}>TEAM</th>
                          <th style={{ ...S.th, ...S.thNum }}>W</th>
                          <th style={{ ...S.th, ...S.thNum }}>L</th>
                          <th style={{ ...S.th, ...S.thNum }}>PF</th>
                          <th style={{ ...S.th, ...S.thNum }}>PA</th>
                          <th style={{ ...S.th, ...S.thNum }}>DIFF</th>
                          <th style={S.th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {gStandings.map((s, i) => (
                          <tr key={s.team_id} onContextMenu={e => openCtx(e, 'standing', undefined, { ...s, groupLabel: g.label })} style={{ cursor: 'context-menu' }}>
                            <td style={{ ...S.td, fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', width: 20 }}>{i + 1}</td>
                            <td style={S.td}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.teams?.color ?? '#888', flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, letterSpacing: 1, fontSize: 12 }}>{s.teams?.name}</span>
                              </div>
                            </td>
                            <td style={{ ...S.td, ...S.tdNum, color: s.wins > 0 ? 'var(--green)' : 'var(--text)' }}>{s.wins}</td>
                            <td style={{ ...S.td, ...S.tdNum, color: s.losses > 0 ? 'var(--rust)' : 'var(--text)' }}>{s.losses}</td>
                            <td style={{ ...S.td, ...S.tdNum }}>{s.points_for}</td>
                            <td style={{ ...S.td, ...S.tdNum }}>{s.points_against}</td>
                            <td style={{ ...S.td, ...S.tdNum, color: diff(s) > 0 ? 'var(--green)' : diff(s) < 0 ? 'var(--rust)' : 'var(--text-dim)', fontWeight: 700 }}>
                              {diff(s) > 0 ? '+' : ''}{diff(s)}
                            </td>
                            <td style={S.td}>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: 8, letterSpacing: 1, padding: '2px 6px', borderRadius: 2, fontWeight: 700, background: accentColor === '#4a7abf' ? 'rgba(74,122,191,0.15)' : 'rgba(184,92,56,0.15)', color: accentColor, border: `1px solid ${accentColor}33` }}>
                                {g.label}{s.seed_override ?? s.seed ?? i + 1}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', padding: '10px 16px 6px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>RESULTS BY ROUND</div>
                    {Object.entries(gRounds).map(([round, rMatches]) => (
                      <div key={round}>
                        <div style={S.roundNameBar}>
                          <span>ROUND {round}</span>
                          <span style={{ color: rMatches.some(m => m.status === 'in_progress') ? 'var(--amber)' : undefined }}>
                            {rMatches.some(m => m.status === 'in_progress') ? 'IN PROGRESS' : rMatches.every(m => m.status === 'complete') ? 'COMPLETE' : 'PENDING'}
                          </span>
                        </div>
                        {rMatches.map(m => (
                          <div
                            key={m.id}
                            onContextMenu={e => openCtx(e, m.status === 'complete' ? 'match-complete' : m.status === 'awaiting_confirmation' ? 'match-unconf' : 'match-pending', m)}
                            style={{ ...S.roundMatch, background: m.status === 'awaiting_confirmation' ? 'rgba(200,132,42,0.04)' : undefined }}
                          >
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: m.team1?.color ?? 'var(--border)', flexShrink: 0 }} />
                              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 11, fontWeight: 600, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.team1?.name ?? 'TBD'}</span>
                              {m.status === 'complete' && m.winner?.id === m.team1?.id && <span style={{ fontFamily: 'var(--font-body)', fontSize: 8, color: 'var(--green)', letterSpacing: 1 }}>W</span>}
                              {m.status === 'awaiting_confirmation' && <span style={{ fontFamily: 'var(--font-body)', fontSize: 8, color: 'var(--amber)', letterSpacing: 1 }}>?</span>}
                            </div>
                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: 'center', color: m.status === 'complete' && m.winner?.id === m.team1?.id ? 'var(--khaki)' : m.status === 'awaiting_confirmation' ? 'rgba(200,132,42,0.7)' : 'var(--text-dim)' }}>{m.score_team1 ?? '—'}</span>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--border-strong)' }}>vs</span>
                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: 'center', color: m.status === 'complete' && m.winner?.id === m.team2?.id ? 'var(--khaki)' : m.status === 'awaiting_confirmation' ? 'rgba(200,132,42,0.7)' : 'var(--text-dim)' }}>{m.score_team2 ?? '—'}</span>
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end', minWidth: 0 }}>
                              {m.status === 'complete' && m.winner?.id === m.team2?.id && <span style={{ fontFamily: 'var(--font-body)', fontSize: 8, color: 'var(--green)', letterSpacing: 1 }}>W</span>}
                              {m.status === 'awaiting_confirmation' && <span style={{ fontFamily: 'var(--font-body)', fontSize: 8, color: 'var(--amber)', letterSpacing: 1 }}>?</span>}
                              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 11, fontWeight: 600, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.team2?.name ?? 'TBD'}</span>
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: m.team2?.color ?? 'var(--border)', flexShrink: 0 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'bracket' && (
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 20, padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4 }}>
              Seeding: <strong style={{ color: 'var(--khaki)' }}>A1 vs B4 · B2 vs A3 · A2 vs B3 · B1 vs A4</strong> — auto-calculated from final standings. Right-click any match to correct errors.
            </div>
            <div style={S.bracketWrap}>
              <div style={S.bracket}>
                <div style={S.bRound}>
                  <div style={S.bRoundLabel}>QUARTERFINALS</div>
                  <div style={S.bRoundMatches}>{qfMatches.map(m => <MatchCard key={m.id} match={m} showGroupBadge />)}</div>
                </div>
                <Connectors count={2} />
                <div style={S.bRound}>
                  <div style={S.bRoundLabel}>SEMIFINALS</div>
                  <div style={S.bRoundMatches}>{sfMatches.map(m => <MatchCard key={m.id} match={m} />)}</div>
                </div>
                <Connectors count={1} />
                <div style={S.bRound}>
                  <div style={S.bRoundLabel}>FINAL</div>
                  <div style={S.bRoundMatches}>{finalMatches.map(m => <MatchCard key={m.id} match={m} />)}</div>
                </div>
                <div style={{ width: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, padding: '16px 0' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <div style={{ position: 'absolute', right: 0, top: '50%', width: 20, height: 1, background: 'var(--border-strong)' }} />
                  </div>
                </div>
                <div style={{ ...S.bRound, minWidth: 170 }}>
                  <div style={S.bRoundLabel}>CHAMPION</div>
                  <div style={S.bRoundMatches}>
                    <div style={{
                      ...S.championCard,
                      border: declaredChampion ? '1px solid var(--khaki)' : '1px solid var(--border)',
                      background: declaredChampion ? 'rgba(200,184,122,0.08)' : 'transparent',
                    }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 3, color: declaredChampion ? 'var(--khaki)' : 'var(--text-dim)', marginBottom: 10 }}>
                        {declaredChampion ? 'WINNER' : pendingChampion ? 'AWAITING DECLARATION' : 'AWAITING FINAL'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
                        {champion && <div style={{ width: 10, height: 10, borderRadius: '50%', background: champion.color }} />}
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: champion ? 18 : 13, fontWeight: 700, letterSpacing: 2, color: declaredChampion ? 'var(--khaki)' : pendingChampion ? 'var(--text-dim)' : 'var(--text-dim)' }}>
                          {champion?.name ?? 'TBD'}
                        </span>
                      </div>
                      {pendingChampion && !declaredChampion && isAdmin && (
                        <button
                          style={{ ...S.btn, ...S.btnChampion, marginTop: 16, fontSize: 10, padding: '6px 12px', width: '100%' }}
                          onClick={() => openModal('declare-champion')}
                          disabled={saving}
                        >
                          🏆 DECLARE
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'queue' && (
          <div>
            {awaitingConfirmation.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, fontFamily: 'var(--font-body)', fontSize: 12, letterSpacing: 2, color: 'var(--text-dim)' }}>NO PENDING CONFIRMATIONS</div>
            ) : (
              awaitingConfirmation.map(m => {
                const group = groups.find(g => g.id === m.group_id)
                const stageLabel = group ? `GROUP ${group.label} · ROUND ${m.round}` : m.stage.toUpperCase()
                return (
                  <div key={m.id} style={S.queueCard}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)' }}>{stageLabel}</span>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--text)', marginTop: 2 }}>{m.team1?.name ?? 'TBD'} vs {m.team2?.name ?? 'TBD'}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)' }}>reported by bot</span>
                        <button style={{ ...S.btn, ...S.btnDanger, padding: '6px 14px', fontSize: 11 }} onClick={() => openModal('reject', m)}>REJECT</button>
                        <button style={{ ...S.btn, ...S.btnPrimary, padding: '6px 14px', fontSize: 11 }} onClick={() => confirmMatch(m)} disabled={saving}>CONFIRM</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 24, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.team1?.color ?? '#888' }} />
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, color: m.winner?.id === m.team1?.id ? 'var(--khaki)' : 'var(--text-dim)' }}>{m.team1?.name}</span>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, color: 'rgba(200,132,42,0.8)' }}>{m.score_team1}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>vs</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, color: 'rgba(200,132,42,0.8)' }}>{m.score_team2}</span>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13, color: m.winner?.id === m.team2?.id ? 'var(--khaki)' : 'var(--text-dim)' }}>{m.team2?.name}</span>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.team2?.color ?? '#888' }} />
                      </div>
                      {m.map && <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-dim)', alignSelf: 'center', marginLeft: 'auto' }}>{m.map}</span>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {ctx && (
        <div ref={ctxRef} style={{ ...S.ctxMenu, left: ctx.x, top: ctx.y }}>
          <div style={S.ctxHeader}>{ctx.match ? `${ctx.match.team1?.name ?? 'TBD'} vs ${ctx.match.team2?.name ?? 'TBD'}` : ctx.standing ? `${ctx.standing.teams?.name} — GROUP ${ctx.standing.groupLabel}` : ''}</div>
          {ctx.type === 'match-complete' && <>
            <button style={S.ctxItem} onClick={() => openModal('edit-match', ctx.match)}>✎ Edit score / swap winner</button>
            <button style={S.ctxItem} onClick={() => openModal('edit-match', ctx.match)}>◎ Change map</button>
            <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
            <button style={S.ctxItem} onClick={() => openModal('reassign', ctx.match)}>⊞ Reassign teams</button>
            <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
            <button style={{ ...S.ctxItem, color: 'var(--rust)' }} onClick={() => { patchMatch(ctx.match!.id, { action: 'reject' }); setCtx(null) }}>↺ Reset to pending</button>
          </>}
          {ctx.type === 'match-unconf' && <>
            <button style={S.ctxItem} onClick={() => { confirmMatch(ctx.match!); setCtx(null) }}>✓ Confirm result</button>
            <button style={S.ctxItem} onClick={() => openModal('reject', ctx.match)}>✕ Reject result</button>
            <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
            <button style={S.ctxItem} onClick={() => openModal('edit-match', ctx.match)}>✎ Edit before confirming</button>
          </>}
          {ctx.type === 'match-live' && <>
            <button style={S.ctxItem} onClick={() => openModal('edit-match', ctx.match)}>✎ Enter result manually</button>
            <button style={S.ctxItem} onClick={() => openModal('reassign', ctx.match)}>⊞ Reassign teams</button>
          </>}
          {ctx.type === 'match-pending' && <>
            <button style={S.ctxItem} onClick={() => openModal('bot-report', ctx.match)}>⚡ Simulate Bot Report</button>
            <button style={S.ctxItem} onClick={() => openModal('edit-match', ctx.match)}>✎ Enter result manually</button>
            <button style={S.ctxItem} onClick={() => openModal('reassign', ctx.match)}>⊞ Reassign teams</button>
          </>}
          {ctx.type === 'standing' && <>
            <button style={S.ctxItem} onClick={() => openModal('edit-standing', undefined, ctx.standing)}>✎ Edit standing</button>
            <button style={S.ctxItem} onClick={() => openModal('edit-standing', undefined, ctx.standing)}>◈ Override seed</button>
            <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
            <button style={S.ctxItem} onClick={() => { setCtx(null); fetchData() }}>↺ Recalculate from results</button>
          </>}
        </div>
      )}

      {modal && (
        <div style={S.modalBackdrop} onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div style={S.modal}>
            {modal.type === 'declare-champion' && pendingChampion && (
              <>
                <div style={S.modalTitle}>DECLARE CHAMPION</div>
                <div style={S.modalSub}>This will lock in the result and mark the draft as complete.</div>
                <div style={S.championConfirm}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: pendingChampion.color }} />
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700, letterSpacing: 3, color: 'var(--khaki)' }}>{pendingChampion.name}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)' }}>DRAFT CHAMPION</div>
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)', marginTop: 8, marginBottom: 4, textAlign: 'center' }}>
                  This cannot be undone without admin override.
                </div>
                <div style={S.modalActions}>
                  <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setModal(null)}>CANCEL</button>
                  <button style={{ ...S.btn, ...S.btnChampion }} onClick={declareChampion} disabled={saving}>
                    🏆 CONFIRM — {pendingChampion.name} WINS
                  </button>
                </div>
              </>
            )}
            {modal.type === 'edit-match' && modal.match && (
              <>
                <div style={S.modalTitle}>EDIT MATCH RESULT</div>
                <div style={S.modalSub}>{modal.match.team1?.name ?? 'TBD'} vs {modal.match.team2?.name ?? 'TBD'}</div>
                <div style={S.modalWarning}>This will recalculate standings and may affect bracket seeding.</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={S.modalLabel}>WINNER</label>
                  <select style={S.modalInput} value={editWinner} onChange={e => setEditWinner(e.target.value)}>
                    {[modal.match.team1, modal.match.team2].filter(Boolean).map(t => <option key={t!.id} value={t!.name}>{t!.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={S.modalLabel}>WINNER SCORE</label>
                    <input style={S.modalInput} type="number" value={editScore1} onChange={e => setEditScore1(e.target.value)} placeholder="e.g. 362" />
                  </div>
                  <div>
                    <label style={S.modalLabel}>LOSER SCORE</label>
                    <input style={S.modalInput} type="number" value={editScore2} onChange={e => setEditScore2(e.target.value)} placeholder="e.g. 211" />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={S.modalLabel}>MAP</label>
                  <input style={S.modalInput} type="text" value={editMap} onChange={e => setEditMap(e.target.value)} placeholder="e.g. dod_thunder2" />
                </div>
                <div style={S.modalActions}>
                  <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setModal(null)}>CANCEL</button>
                  <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => editMatch(modal.match!)} disabled={saving}>SAVE</button>
                </div>
              </>
            )}
            {modal.type === 'bot-report' && modal.match && (
              <>
                <div style={S.modalTitle}>⚡ SIMULATE BOT REPORT</div>
                <div style={S.modalSub}>{modal.match.team1?.name ?? 'TBD'} vs {modal.match.team2?.name ?? 'TBD'}</div>
                <div style={S.modalWarning}>Submits scores as if the KTP Score Bot reported them. Match goes to Awaiting Confirmation.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={S.modalLabel}>{modal.match.team1?.name ?? 'Team 1'} SCORE</label>
                    <input style={S.modalInput} type="number" min={0} value={editScore1} onChange={e => setEditScore1(e.target.value)} placeholder="e.g. 362" />
                  </div>
                  <div>
                    <label style={S.modalLabel}>{modal.match.team2?.name ?? 'Team 2'} SCORE</label>
                    <input style={S.modalInput} type="number" min={0} value={editScore2} onChange={e => setEditScore2(e.target.value)} placeholder="e.g. 211" />
                  </div>
                </div>
                <div style={S.modalActions}>
                  <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setModal(null)}>CANCEL</button>
                  <button
                    style={{ ...S.btn, ...S.btnPrimary }}
                    disabled={saving || editScore1 === '' || editScore2 === ''}
                    onClick={async () => {
                      setSaving(true)
                      const ok = await patchMatch(modal.match!.id, {
                        action: 'report',
                        score_team1: parseInt(editScore1),
                        score_team2: parseInt(editScore2),
                      })
                      setSaving(false)
                      if (ok) { setModal(null); setEditScore1(''); setEditScore2('') }
                    }}
                  >SUBMIT REPORT</button>
                </div>
              </>
            )}
            {modal.type === 'reject' && modal.match && (
              <>
                <div style={S.modalTitle}>REJECT RESULT</div>
                <div style={S.modalSub}>{modal.match.team1?.name ?? 'TBD'} vs {modal.match.team2?.name ?? 'TBD'}</div>
                <div style={S.modalWarning}>Match will be reset to pending. The bot will need to report again.</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={S.modalLabel}>REASON (optional)</label>
                  <input style={S.modalInput} type="text" value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="e.g. Wrong teams reported" />
                </div>
                <div style={S.modalActions}>
                  <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setModal(null)}>CANCEL</button>
                  <button style={{ ...S.btn, ...S.btnDanger, border: '1px solid rgba(192,57,43,0.3)' }} onClick={() => rejectMatch(modal.match!, rejectNote)} disabled={saving}>REJECT</button>
                </div>
              </>
            )}
            {modal.type === 'edit-standing' && modal.standing && (
              <>
                <div style={S.modalTitle}>EDIT STANDING</div>
                <div style={S.modalSub}>{modal.standing.teams?.name} — GROUP {modal.standing.groupLabel}</div>
                <div style={S.modalWarning}>Directly editing standings overrides calculated values. Use only to correct bot errors.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div><label style={S.modalLabel}>WINS</label><input style={S.modalInput} type="number" value={editW} onChange={e => setEditW(e.target.value)} /></div>
                  <div><label style={S.modalLabel}>LOSSES</label><input style={S.modalInput} type="number" value={editL} onChange={e => setEditL(e.target.value)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div><label style={S.modalLabel}>POINTS FOR</label><input style={S.modalInput} type="number" value={editPF} onChange={e => setEditPF(e.target.value)} /></div>
                  <div><label style={S.modalLabel}>POINTS AGAINST</label><input style={S.modalInput} type="number" value={editPA} onChange={e => setEditPA(e.target.value)} /></div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={S.modalLabel}>SEED OVERRIDE</label>
                  <select style={S.modalInput} value={editSeed} onChange={e => setEditSeed(e.target.value)}>
                    <option value="">Auto (calculated)</option>
                    {['A1','A2','A3','A4','B1','B2','B3','B4'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={S.modalActions}>
                  <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setModal(null)}>CANCEL</button>
                  <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => editStanding(modal.standing!)} disabled={saving}>SAVE</button>
                </div>
              </>
            )}
            {modal.type === 'reassign' && modal.match && (
              <>
                <div style={S.modalTitle}>REASSIGN TEAMS</div>
                <div style={S.modalSub}>{modal.match.stage.toUpperCase()} · MATCH {modal.match.match_number}</div>
                <div style={S.modalWarning}>Changes which teams are in this match. Bracket updates immediately.</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={S.modalLabel}>TEAM 1</label>
                  <select style={S.modalInput}>{standings.map(s => <option key={s.team_id}>{s.teams?.name}</option>)}</select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={S.modalLabel}>TEAM 2</label>
                  <select style={S.modalInput}>{standings.map(s => <option key={s.team_id}>{s.teams?.name}</option>)}</select>
                </div>
                <div style={S.modalActions}>
                  <button style={{ ...S.btn, ...S.btnGhost }} onClick={() => setModal(null)}>CANCEL</button>
                  <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setModal(null)}>CONFIRM</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ ...S.toast, borderColor: toast.error ? 'rgba(192,57,43,0.5)' : 'var(--border-strong)', color: toast.error ? 'var(--rust)' : 'var(--text)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
