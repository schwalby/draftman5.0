'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Topbar } from '@/components/Topbar'
import { Spinner } from '@/components/Spinner'

type Team = {
  id: string; name: string; color: string; pick_order: number; captain_id: string | null
  captain?: { ingame_name: string | null; discord_username: string } | null
}
type Pick = {
  id: string; team_id: string; pick_number: number; class: string | null
  user?: { ingame_name: string | null; discord_username: string } | null
}
type Standing = {
  team_id: string; wins: number; losses: number
  points_for: number; points_against: number; seed: number | null; group_id: string | null
}
type TMatch = {
  id: string; stage: string; round: number; match_number: number
  team1_id: string | null; team2_id: string | null
  winner_id: string | null; score_team1: number | null; score_team2: number | null
  status: string; map: string | null; group_id: string | null
  team1?: any; team2?: any
}
type Group = { id: string; label: string }
type Tournament = { id: string; champion_team_id: string | null }

const CLS_COLOR: Record<string, string> = {
  rifle: '#c8a050', light: '#4a9c6a', third: '#4a9c6a', heavy: '#9c5a4a', sniper: '#5a6a9c', flex: '#888'
}
const CLS_SHORT: Record<string, string> = {
  rifle: 'Ri', light: 'Lt', third: 'Th', heavy: 'Hv', sniper: 'Sn', flex: 'Fx'
}
const STAGE_ORDER: Record<string, number> = { final: 4, semifinal: 3, quarterfinal: 2 }
const QF_SEEDS: Record<string, string> = {
  '1-0': 'A1', '1-1': 'B4', '2-0': 'B2', '2-1': 'A3',
  '3-0': 'A2', '3-1': 'B3', '4-0': 'B1', '4-1': 'A4',
}

function capName(t: Team) { return t.captain?.ingame_name || t.captain?.discord_username || t.name }
function pickName(p: Pick) { return p.user?.ingame_name || p.user?.discord_username || '?' }
function resolveTeam(t: any): { id: string; name: string; color: string } | null {
  if (!t) return null
  return Array.isArray(t) ? (t[0] ?? null) : t
}
function playoffResult(teamId: string, playoffMatches: TMatch[], tournament: Tournament | null) {
  if (!tournament) return null
  if (tournament.champion_team_id === teamId) return { label: '🏆 CHAMPION', champ: true }
  const played = playoffMatches
    .filter(m => (m.team1_id === teamId || m.team2_id === teamId) && m.status === 'complete')
    .sort((a, b) => (STAGE_ORDER[b.stage] ?? 0) - (STAGE_ORDER[a.stage] ?? 0))
  if (!played.length) return null
  const s = played[0].stage
  return { label: s === 'final' ? 'FINALIST' : s === 'semifinal' ? 'SEMIFINAL' : 'QUARTERFINAL', champ: false }
}

const sHd: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 14px' }
const sHdLabel: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 3, color: 'var(--text-dim)' }
const sHdLine: React.CSSProperties = { flex: 1, height: 1, background: 'var(--border)' }

export default function DraftSummaryPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [eventName, setEventName] = useState('')
  const [eventStatus, setEventStatus] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [matches, setMatches] = useState<TMatch[]>([])
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

    const [{ data: ev }, { data: teamsData }, { data: picksData }] = await Promise.all([
      sb.from('events').select('name, status').eq('id', eventId).maybeSingle(),
      sb.from('teams').select('*, captain:captain_id(ingame_name, discord_username)').eq('event_id', eventId).order('pick_order'),
      sb.from('draft_picks').select('*, user:users(ingame_name, discord_username)').eq('event_id', eventId).order('pick_number'),
    ])
    if (ev) { setEventName(ev.name ?? ''); setEventStatus(ev.status ?? '') }
    setTeams(teamsData ?? [])
    setPicks(picksData ?? [])

    const { data: t } = await sb.from('tournaments').select('id, champion_team_id').eq('event_id', eventId).maybeSingle()
    setTournament(t ?? null)
    if (t) {
      const [{ data: grps }, { data: stData }, { data: mData }] = await Promise.all([
        sb.from('tournament_groups').select('id, label').eq('tournament_id', t.id).order('label'),
        sb.from('tournament_standings').select('team_id, wins, losses, points_for, points_against, seed, group_id').eq('tournament_id', t.id),
        sb.from('tournament_matches')
          .select('id, stage, round, match_number, team1_id, team2_id, winner_id, score_team1, score_team2, status, map, group_id, team1:team1_id(id,name,color), team2:team2_id(id,name,color)')
          .eq('tournament_id', t.id).order('round').order('match_number'),
      ])
      setGroups(grps ?? [])
      setStandings(stData ?? [])
      setMatches(mData ?? [])
    }
    setLoading(false)
  }, [eventId])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/'); return }
    if (status !== 'authenticated') return
    const user = session?.user
    if (user?.isOrganizer || user?.isSuperUser) { setHasAccess(true); fetchData(); return }
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      .from('signups').select('id').eq('event_id', eventId).eq('user_id', user?.userId ?? '').maybeSingle()
      .then(({ data }) => { if (data) { setHasAccess(true); fetchData() } else setLoading(false) })
  }, [status, session, eventId, fetchData, router])

  if (status === 'loading' || loading) return (
    <div>
      <Topbar breadcrumbs={[{ label: eventName || 'Event', href: `/events/${eventId}` }, { label: 'Draft Summary' }]} />
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
    </div>
  )
  if (!hasAccess) return (
    <div>
      <Topbar breadcrumbs={[{ label: 'Event', href: `/events/${eventId}` }, { label: 'Draft Summary' }]} />
      <div style={{ padding: 60, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 2, color: 'var(--text-dim)' }}>
        YOU MUST BE SIGNED UP FOR THIS EVENT TO VIEW ROSTERS
      </div>
    </div>
  )

  const teamPicks = (id: string) => picks.filter(p => p.team_id === id).sort((a, b) => a.pick_number - b.pick_number)
  const standingFor = (id: string) => standings.find(s => s.team_id === id)
  const playoffMatches = matches.filter(m => m.stage !== 'group')
  const qfMatches = matches.filter(m => m.stage === 'quarterfinal').sort((a, b) => a.match_number - b.match_number)
  const sfMatches = matches.filter(m => m.stage === 'semifinal').sort((a, b) => a.match_number - b.match_number)
  const finalMatch = matches.find(m => m.stage === 'final')
  const champion = tournament?.champion_team_id ? teams.find(t => t.id === tournament.champion_team_id) : null
  const isComplete = eventStatus === 'completed'

  function BracketMatchCard({ match, showSeeds = false }: { match: TMatch; showSeeds?: boolean }) {
    const t1 = resolveTeam(match.team1)
    const t2 = resolveTeam(match.team2)
    const complete = match.status === 'complete'
    const footer = match.map ? `${match.map} · ${complete ? 'CONFIRMED' : match.status.toUpperCase()}` : complete ? 'CONFIRMED' : match.status === 'pending' ? 'PENDING' : match.status.toUpperCase()

    return (
      <div style={{ border: `1px solid ${complete ? 'rgba(200,184,122,0.2)' : 'var(--border)'}`, borderRadius: 4, overflow: 'hidden', background: 'var(--surface)' }}>
        {[t1, t2].map((team, i) => {
          const score = i === 0 ? match.score_team1 : match.score_team2
          const won = complete && team?.id === match.winner_id
          const lost = complete && team?.id !== match.winner_id
          const seed = showSeeds ? QF_SEEDS[`${match.match_number}-${i}`] : null
          const seedIsA = seed?.startsWith('A')
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderBottom: i === 0 ? '1px solid var(--border)' : 'none', background: won ? 'rgba(200,184,122,0.05)' : 'transparent', opacity: lost ? 0.45 : 1 }}>
              <div style={{ width: 3, height: 22, borderRadius: 1, background: team?.color ?? 'var(--border)', flexShrink: 0 }} />
              {seed && (
                <span style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, fontWeight: 700, flexShrink: 0, background: seedIsA ? 'rgba(74,122,191,0.18)' : 'rgba(184,92,56,0.18)', color: seedIsA ? '#4a7abf' : '#b85c38' }}>
                  {seed}
                </span>
              )}
              <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: team ? 'var(--text)' : 'var(--text-dim)' }}>
                {team?.name ?? 'TBD'}
              </span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700, minWidth: 28, textAlign: 'right', color: won ? 'var(--khaki)' : 'var(--text-dim)' }}>
                {score ?? '—'}
              </span>
            </div>
          )
        })}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 8, letterSpacing: 1, color: 'var(--text-dim)', padding: '3px 10px', background: 'var(--surface2)', textAlign: 'center' }}>
          {footer}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar breadcrumbs={[{ label: eventName || 'Event', href: `/events/${eventId}` }, { label: 'Draft Summary' }]} />
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700, letterSpacing: 4, color: 'var(--khaki)' }}>
              DRAFT SUMMARY{eventName ? ` · ${eventName}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 4 }}>
              {teams.length} TEAMS · {picks.length} PLAYERS DRAFTED{isComplete ? ' · EVENT COMPLETE' : ''}
            </div>
          </div>
          {isComplete && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, padding: '4px 10px', borderRadius: 3, background: 'rgba(74,156,106,0.1)', color: 'var(--green)', border: '1px solid rgba(74,156,106,0.25)' }}>
              COMPLETE
            </span>
          )}
        </div>

        {/* ── TEAMS ── */}
        <div style={sHd}>
          <span style={sHdLabel}>TEAMS</span>
          <div style={sHdLine} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)' }}>click for team detail</span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {teams.map(team => {
            const tp = teamPicks(team.id)
            const s = standingFor(team.id)
            const result = playoffResult(team.id, playoffMatches, tournament)
            return (
              <Link key={team.id} href={`/events/${eventId}/teams/${team.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', height: '100%' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
                >
                  <div style={{ padding: '8px 10px 7px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ height: 2, borderRadius: 1, background: team.color, marginBottom: 6 }} />
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700, letterSpacing: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>♛ {capName(team)}</div>
                  </div>
                  <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 4px', borderRadius: 2, background: 'rgba(200,184,122,0.05)' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR['rifle'], flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{capName(team)}</span>
                      <span style={{ fontSize: 8, color: 'var(--khaki)' }}>♛</span>
                    </div>
                    {tp.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 4px', borderRadius: 2 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR[p.class || 'flex'], flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pickName(p)}</span>
                        <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{CLS_SHORT[p.class || 'flex']}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '4px 10px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-body)', fontSize: 8, letterSpacing: 2, textAlign: 'center', color: result?.champ ? 'var(--khaki)' : 'var(--text-dim)' }}>
                    {result?.label ?? (s ? `${s.wins}W ${s.losses}L` : '—')}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* ── PLAYOFF BRACKET ── */}
        {tournament && (
          <>
            <div style={sHd}>
              <span style={sHdLabel}>PLAYOFF BRACKET</span>
              <div style={sHdLine} />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 700 }}>

                {/* QUARTERFINALS */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: 200, fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', textAlign: 'center', paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
                    QUARTERFINALS
                  </div>
                  <div style={{ width: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, padding: '20px 0', gap: 8 }}>
                    {qfMatches.map(m => <BracketMatchCard key={m.id} match={m} showSeeds />)}
                  </div>
                </div>

                {/* SEMIFINALS */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: 200, fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', textAlign: 'center', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    SEMIFINALS
                  </div>
                  <div style={{ width: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, padding: '20px 0', gap: 8 }}>
                    {sfMatches.map(m => <BracketMatchCard key={m.id} match={m} />)}
                  </div>
                </div>

                {/* FINAL */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: 200, fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', textAlign: 'center', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    FINAL
                  </div>
                  <div style={{ width: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, padding: '20px 0', gap: 8 }}>
                    {finalMatch && <BracketMatchCard match={finalMatch} />}
                  </div>
                </div>

                {/* CHAMPION */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: 200, fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', textAlign: 'center', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    CHAMPION
                  </div>
                  <div style={{ width: 200, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flex: 1, padding: '20px 0' }}>
                    <div style={{ border: '1px solid var(--khaki)', borderRadius: 4, padding: '8px 14px', textAlign: 'center', background: 'rgba(200,184,122,0.04)' }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 8, letterSpacing: 3, color: 'var(--khaki)', marginBottom: 5 }}>WINNER</div>
                      {champion && <div style={{ width: 9, height: 9, borderRadius: '50%', background: champion.color, margin: '0 auto 4px' }} />}
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, letterSpacing: 2, color: 'var(--khaki)' }}>
                        {champion?.name ?? 'TBD'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </>
        )}

        {/* ── ROUND ROBIN ── */}
        {groups.length > 0 && (
          <>
            <div style={sHd}>
              <span style={sHdLabel}>ROUND ROBIN</span>
              <div style={sHdLine} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {groups.map(group => {
                const accentColor = group.label === 'A' ? '#4a7abf' : '#b85c38'
                const groupStandings = standings
                  .filter(s => s.group_id === group.id)
                  .sort((a, b) => {
                    if (b.wins !== a.wins) return b.wins - a.wins
                    return (b.points_for - b.points_against) - (a.points_for - a.points_against)
                  })
                const groupMatches = matches
                  .filter(m => m.group_id === group.id && m.status === 'complete')
                  .sort((a, b) => a.round - b.round || a.match_number - b.match_number)
                const rounds: Record<number, TMatch[]> = {}
                for (const m of groupMatches) {
                  if (!rounds[m.round]) rounds[m.round] = []
                  rounds[m.round].push(m)
                }

                return (
                  <div key={group.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    {/* Group header */}
                    <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 3, height: 18, borderRadius: 2, background: accentColor }} />
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700, letterSpacing: 3, color: accentColor }}>GROUP {group.label}</span>
                    </div>

                    {/* Standings table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          {['#', 'TEAM', 'W', 'L', 'PF', 'PA', 'DIFF'].map((h, i) => (
                            <th key={h} style={{ fontFamily: 'var(--font-body)', fontSize: 8, letterSpacing: 2, color: 'var(--text-dim)', padding: '6px 10px', textAlign: i > 1 ? 'right' : 'left', borderBottom: '1px solid var(--border-strong)', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupStandings.map((s, i) => {
                          const team = teams.find(t => t.id === s.team_id)
                          const diff = s.points_for - s.points_against
                          return (
                            <tr key={s.team_id}>
                              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: 8, padding: '1px 5px', borderRadius: 2, fontWeight: 700, letterSpacing: 1, background: group.label === 'A' ? 'rgba(74,122,191,0.18)' : 'rgba(184,92,56,0.18)', color: accentColor }}>
                                  {group.label}{s.seed ?? i + 1}
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: team?.color ?? '#888', flexShrink: 0 }} />
                                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>{team?.name ?? '?'}</span>
                                </div>
                              </td>
                              {[
                                { v: s.wins, c: s.wins > 0 ? 'var(--green)' : 'var(--text)' },
                                { v: s.losses, c: s.losses > 0 ? 'var(--rust)' : 'var(--text)' },
                                { v: s.points_for, c: 'var(--text)' },
                                { v: s.points_against, c: 'var(--text)' },
                                { v: (diff >= 0 ? '+' : '') + diff, c: diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--rust)' : 'var(--text-dim)' },
                              ].map((cell, ci) => (
                                <td key={ci} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 600, color: cell.c }}>{cell.v}</td>
                              ))}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    {/* Round-by-round results */}
                    {Object.entries(rounds).map(([round, rMatches]) => {
                      const mapName = rMatches[0]?.map
                      return (
                        <div key={round}>
                          <div style={{ padding: '5px 14px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-body)', fontSize: 8, letterSpacing: 2, color: 'var(--text-dim)' }}>
                            <span>ROUND {round}{mapName ? <span style={{ color: 'var(--text)', marginLeft: 6 }}>· {mapName}</span> : null}</span>
                            <span style={{ color: 'var(--green)' }}>COMPLETE</span>
                          </div>
                          {rMatches.map(m => {
                            const t1 = resolveTeam(m.team1)
                            const t2 = resolveTeam(m.team2)
                            const winner1 = m.winner_id === m.team1_id
                            return (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 14px', borderTop: '1px solid var(--border)', gap: 8, fontFamily: 'var(--font-body)', fontSize: 11 }}>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: t1?.color ?? '#888', flexShrink: 0 }} />
                                  <span style={{ color: winner1 ? 'var(--text)' : 'var(--text-dim)' }}>{t1?.name ?? '?'}</span>
                                  {winner1 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />}
                                </div>
                                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700, minWidth: 56, textAlign: 'center', color: 'var(--khaki)' }}>
                                  {m.score_team1 ?? '—'} – {m.score_team2 ?? '—'}
                                </div>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                                  {!winner1 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />}
                                  <span style={{ color: !winner1 ? 'var(--text)' : 'var(--text-dim)' }}>{t2?.name ?? '?'}</span>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: t2?.color ?? '#888', flexShrink: 0 }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
