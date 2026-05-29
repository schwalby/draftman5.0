'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Topbar } from '@/components/Topbar'
import { Spinner } from '@/components/Spinner'

type Team = {
  id: string; name: string; color: string; captain_id: string | null; event_id: string
  captain?: { ingame_name: string | null; discord_username: string } | null
}
type Event = { id: string; name: string; starts_at: string | null; status: string }
type Pick = {
  id: string; team_id: string; user_id: string; pick_number: number; class: string | null
  user?: { ingame_name: string | null; discord_username: string } | null
}
type Standing = { team_id: string; wins: number; losses: number; points_for: number; points_against: number; seed: number | null }
type Match = {
  id: string; stage: string; round: number; match_number: number
  team1_id: string | null; team2_id: string | null
  winner_id: string | null; score_team1: number | null; score_team2: number | null
  score_half1_team1: number | null; score_half1_team2: number | null
  score_half2_team1: number | null; score_half2_team2: number | null
  status: string; map: string | null
  team1?: { name: string } | { name: string }[] | null; team2?: { name: string } | { name: string }[] | null
}
type Tournament = { id: string; champion_team_id: string | null }

const CLS_COLOR: Record<string, string> = {
  rifle: '#c8a050', light: '#4a9c6a', third: '#4a9c6a', heavy: '#9c5a4a', sniper: '#5a6a9c', flex: '#888'
}
const CLS_LABEL: Record<string, string> = {
  rifle: 'Rifle', light: 'Light', third: 'Third', heavy: 'Heavy', sniper: 'Sniper', flex: 'Flex'
}
const STAGE_ORDER: Record<string, number> = { final: 4, semifinal: 3, quarterfinal: 2, group: 1 }
const STAGE_LABEL: Record<string, string> = { final: 'FINAL', semifinal: 'SEMIFINAL', quarterfinal: 'QUARTERFINAL', group: 'GROUP' }

function capName(team: Team) { return team.captain?.ingame_name || team.captain?.discord_username || team.name }
function pickName(p: Pick) { return p.user?.ingame_name || p.user?.discord_username || '?' }
function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function highestStage(teamId: string, matches: Match[]) {
  const played = matches.filter(m => (m.team1_id === teamId || m.team2_id === teamId) && m.status === 'complete')
  if (!played.length) return null
  return played.reduce((best, m) => (STAGE_ORDER[m.stage] ?? 0) > (STAGE_ORDER[best.stage] ?? 0) ? m : best)
}

export default function TeamDetailPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const teamId = params.teamId as string

  const [team, setTeam] = useState<Team | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [standing, setStanding] = useState<Standing | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

    const { data: teamData } = await sb
      .from('teams').select('*, captain:captain_id(ingame_name, discord_username)').eq('id', teamId).maybeSingle()
    if (!teamData) { setLoading(false); return }
    setTeam(teamData)

    const [{ data: ev }, { data: picksData }, { data: t }] = await Promise.all([
      sb.from('events').select('id, name, starts_at, status').eq('id', teamData.event_id).maybeSingle(),
      sb.from('draft_picks').select('*, user:users(ingame_name, discord_username)').eq('team_id', teamId).order('pick_number'),
      sb.from('tournaments').select('id, champion_team_id').eq('event_id', teamData.event_id).maybeSingle(),
    ])
    setEvent(ev ?? null)
    setPicks(picksData ?? [])
    setTournament(t ?? null)

    if (t) {
      const [{ data: s }, { data: m }] = await Promise.all([
        sb.from('tournament_standings').select('team_id, wins, losses, points_for, points_against, seed').eq('tournament_id', t.id).eq('team_id', teamId).maybeSingle(),
        sb.from('tournament_matches')
          .select('id, stage, round, match_number, team1_id, team2_id, winner_id, score_team1, score_team2, score_half1_team1, score_half1_team2, score_half2_team1, score_half2_team2, status, map, team1:team1_id(name), team2:team2_id(name)')
          .eq('tournament_id', t.id)
          .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
          .eq('status', 'complete')
          .order('round').order('match_number'),
      ])
      setStanding(s ?? null)
      setMatches(m ?? [])
    }

    setLoading(false)
  }, [teamId])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/'); return }
    if (status !== 'authenticated') return

    const user = session?.user
    if (user?.isOrganizer || user?.isSuperUser) { setHasAccess(true); fetchData(); return }

    // Fetch team first to get event_id, then check signup
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      .from('teams').select('event_id').eq('id', teamId).maybeSingle()
      .then(({ data: t }) => {
        if (!t?.event_id) { setLoading(false); return }
        return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
          .from('signups').select('id').eq('event_id', t.event_id).eq('user_id', user?.userId ?? '').maybeSingle()
      })
      .then(result => {
        if (result?.data) { setHasAccess(true); fetchData() }
        else setLoading(false)
      })
  }, [status, session, teamId, fetchData, router])

  const eventId = team?.event_id || (params.id as string)

  if (status === 'loading' || loading) return (
    <div>
      <Topbar breadcrumbs={[{ label: 'Event', href: `/events/${eventId}` }, { label: 'Draft Summary', href: `/events/${eventId}/summary` }, { label: '...' }]} />
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
    </div>
  )

  if (!hasAccess || !team) return (
    <div>
      <Topbar breadcrumbs={[{ label: 'Event', href: `/events/${eventId}` }, { label: 'Draft Summary', href: `/events/${eventId}/summary` }]} />
      <div style={{ padding: 60, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 2, color: 'var(--text-dim)' }}>
        {!hasAccess ? 'YOU MUST BE SIGNED UP FOR THIS EVENT TO VIEW ROSTERS' : 'TEAM NOT FOUND'}
      </div>
    </div>
  )

  const isChampion = tournament?.champion_team_id === team.id
  const best = highestStage(team.id, matches)
  const diff = standing ? standing.points_for - standing.points_against : 0
  const totalMatches = standing ? standing.wins + standing.losses : 0

  let resultLabel = '—'
  if (isChampion) resultLabel = '🏆 CHAMPION'
  else if (best) resultLabel = STAGE_LABEL[best.stage] ?? best.stage.toUpperCase()

  return (
    <div>
      <Topbar breadcrumbs={[
        { label: event?.name || 'Event', href: `/events/${eventId}` },
        { label: 'Draft Summary', href: `/events/${eventId}/summary` },
        { label: team.name },
      ]} />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 32, paddingBottom: 28, borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 4, borderRadius: 2, background: team.color, alignSelf: 'stretch', flexShrink: 0, minHeight: 56 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, fontWeight: 700, letterSpacing: 5, color: 'var(--khaki)', lineHeight: 1 }}>
              {team.name}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 6 }}>
              {event?.name}{event?.starts_at ? ` · ${formatDate(event.starts_at)}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)', marginTop: 4 }}>
              Captain: <span style={{ color: 'var(--text)' }}>{capName(team)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, padding: '4px 10px', borderRadius: 3, fontWeight: 700,
              background: isChampion ? 'rgba(126,184,212,0.15)' : 'rgba(126,184,212,0.06)',
              color: isChampion ? 'var(--khaki)' : 'var(--text-dim)',
              border: isChampion ? '1px solid rgba(126,184,212,0.4)' : '1px solid var(--border)',
            }}>
              {resultLabel}
            </span>
          </div>
        </div>

        {/* Stats */}
        {standing && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
            {[
              { val: standing.wins, lbl: 'WINS', color: 'var(--green)' },
              { val: standing.losses, lbl: 'LOSSES', color: 'var(--rust)' },
              { val: (diff >= 0 ? '+' : '') + diff, lbl: 'POINT DIFF', color: diff >= 0 ? 'var(--khaki)' : 'var(--rust)' },
              { val: totalMatches, lbl: 'MATCHES', color: 'var(--text)' },
              ...(standing.seed ? [{ val: standing.seed, lbl: 'GROUP SEED', color: 'var(--text)' }] : []),
            ].map(s => (
              <div key={s.lbl} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '12px 18px', flex: 1, minWidth: 90 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 2 }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        )}

        {/* Roster */}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 10 }}>ROSTER</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
          <thead>
            <tr>
              {['PLAYER', 'CLASS', 'ROLE', 'PICK'].map(h => (
                <th key={h} style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-strong)', fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Captain row */}
            <tr>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{capName(team)}</span>
                </div>
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: CLS_COLOR['rifle'] }}>Rifle</span>
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1.5, padding: '2px 7px', borderRadius: 3, background: 'rgba(126,184,212,0.15)', color: 'var(--khaki)', border: '1px solid rgba(126,184,212,0.3)' }}>♛ CAPTAIN</span>
              </td>
              <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)' }}>Pre-draft</td>
            </tr>
            {picks.map(p => (
              <tr key={p.id}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: CLS_COLOR[p.class || 'flex'], flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{pickName(p)}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: CLS_COLOR[p.class || 'flex'] }}>{CLS_LABEL[p.class || 'flex']}</span>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 1, padding: '2px 7px', borderRadius: 3, background: 'rgba(126,184,212,0.08)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>PICK {p.pick_number}</span>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)' }}>Draft</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Match history */}
        {matches.length > 0 && (
          <>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 3, color: 'var(--text-dim)', marginBottom: 10 }}>MATCH HISTORY</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {matches.map(m => {
                const isTeam1 = m.team1_id === team.id
                const t1 = Array.isArray(m.team1) ? m.team1[0] : m.team1
                const t2 = Array.isArray(m.team2) ? m.team2[0] : m.team2
                const opponent = isTeam1 ? t2?.name : t1?.name
                const myScore = isTeam1 ? m.score_team1 : m.score_team2
                const oppScore = isTeam1 ? m.score_team2 : m.score_team1
                const won = m.winner_id === team.id
                const isPlayoff = m.stage !== 'group'
                return (
                  <div key={m.id} style={{
                    background: 'var(--surface)', borderRadius: 4, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    border: m.stage === 'final' ? '1px solid rgba(126,184,212,0.3)' : '1px solid var(--border)',
                  }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, color: isPlayoff ? 'var(--khaki)' : 'var(--text-dim)', width: 96, flexShrink: 0 }}>
                      {STAGE_LABEL[m.stage] ?? m.stage.toUpperCase()}
                    </span>
                    <div style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 13 }}>
                      <strong style={{ color: 'var(--text)' }}>{team.name}</strong>
                      <span style={{ color: 'var(--text-dim)', fontSize: 10, margin: '0 6px' }}>vs</span>
                      <span style={{ color: 'var(--text-dim)' }}>{opponent ?? 'TBD'}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, color: 'var(--khaki)' }}>
                        {myScore ?? '—'} – {oppScore ?? '—'}
                      </div>
                      {m.score_half1_team1 != null && (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: 1, marginTop: 2 }}>
                          {isTeam1
                            ? `${m.score_half1_team1}–${m.score_half1_team2} · ${m.score_half2_team1}–${m.score_half2_team2}`
                            : `${m.score_half1_team2}–${m.score_half1_team1} · ${m.score_half2_team2}–${m.score_half2_team1}`
                          }
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: 9, letterSpacing: 2, padding: '3px 8px', borderRadius: 3, fontWeight: 700, minWidth: 28, textAlign: 'center',
                      background: won ? 'rgba(74,156,106,0.12)' : 'rgba(192,57,43,0.08)',
                      color: won ? 'var(--green)' : 'var(--rust)',
                      border: won ? '1px solid rgba(74,156,106,0.3)' : '1px solid rgba(192,57,43,0.2)',
                    }}>
                      {won ? 'W' : 'L'}
                    </span>
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
