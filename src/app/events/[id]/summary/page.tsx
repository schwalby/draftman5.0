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
  id: string; team_id: string; user_id: string; pick_number: number; class: string | null
  user?: { ingame_name: string | null; discord_username: string } | null
}
type Standing = { team_id: string; wins: number; losses: number; points_for: number; points_against: number }
type PlMatch = { stage: string; team1_id: string | null; team2_id: string | null; winner_id: string | null; status: string }
type Tournament = { id: string; champion_team_id: string | null }

const CLS_COLOR: Record<string, string> = {
  rifle: '#c8a050', light: '#4a9c6a', third: '#4a9c6a', heavy: '#9c5a4a', sniper: '#5a6a9c', flex: '#888'
}
const CLS_SHORT: Record<string, string> = {
  rifle: 'Ri', light: 'Lt', third: 'Th', heavy: 'Hv', sniper: 'Sn', flex: 'Fx'
}
const STAGE_ORDER: Record<string, number> = { final: 4, semifinal: 3, quarterfinal: 2 }

function capName(team: Team) {
  return team.captain?.ingame_name || team.captain?.discord_username || team.name
}
function pickName(p: Pick) {
  return p.user?.ingame_name || p.user?.discord_username || '?'
}

function playoffResult(teamId: string, matches: PlMatch[], tournament: Tournament | null) {
  if (!tournament) return null
  if (tournament.champion_team_id === teamId) return { label: '🏆 CHAMP', color: 'var(--khaki)' }
  const played = matches
    .filter(m => (m.team1_id === teamId || m.team2_id === teamId) && m.status === 'complete')
    .sort((a, b) => (STAGE_ORDER[b.stage] ?? 0) - (STAGE_ORDER[a.stage] ?? 0))
  if (!played.length) return null
  const stage = played[0].stage
  if (stage === 'final') return { label: 'FINALIST', color: 'var(--text-dim)' }
  if (stage === 'semifinal') return { label: 'SEMIFINAL', color: 'var(--text-dim)' }
  if (stage === 'quarterfinal') return { label: 'QUARTERFINAL', color: 'var(--text-dim)' }
  return null
}

export default function DraftSummaryPage() {
  const { data: session, status } = useSession()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [eventName, setEventName] = useState('')
  const [teams, setTeams] = useState<Team[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [standings, setStandings] = useState<Standing[]>([])
  const [matches, setMatches] = useState<PlMatch[]>([])
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

    const [{ data: ev }, { data: teamsData }, { data: picksData }] = await Promise.all([
      sb.from('events').select('name').eq('id', eventId).maybeSingle(),
      sb.from('teams').select('*, captain:captain_id(ingame_name, discord_username)').eq('event_id', eventId).order('pick_order'),
      sb.from('draft_picks').select('*, user:users(ingame_name, discord_username)').eq('event_id', eventId).order('pick_number'),
    ])

    if (ev?.name) setEventName(ev.name)
    setTeams(teamsData ?? [])
    setPicks(picksData ?? [])

    const { data: t } = await sb.from('tournaments').select('id, champion_team_id').eq('event_id', eventId).maybeSingle()
    setTournament(t ?? null)

    if (t) {
      const [{ data: stData }, { data: mData }] = await Promise.all([
        sb.from('tournament_standings').select('team_id, wins, losses, points_for, points_against').eq('tournament_id', t.id),
        sb.from('tournament_matches').select('stage, team1_id, team2_id, winner_id, status').eq('tournament_id', t.id).neq('stage', 'group'),
      ])
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
      .then(({ data }) => {
        if (data) { setHasAccess(true); fetchData() }
        else setLoading(false)
      })
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

  const teamPicks = (teamId: string) =>
    picks.filter(p => p.team_id === teamId).sort((a, b) => a.pick_number - b.pick_number)
  const standing = (teamId: string) => standings.find(s => s.team_id === teamId)

  return (
    <div>
      <Topbar breadcrumbs={[{ label: eventName || 'Event', href: `/events/${eventId}` }, { label: 'Draft Summary' }]} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 700, letterSpacing: 4, color: 'var(--khaki)' }}>
            DRAFT SUMMARY{eventName ? ` · ${eventName}` : ''}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 4 }}>
            {teams.length} TEAMS · {picks.length} PLAYERS DRAFTED · CLICK A TEAM FOR FULL DETAIL
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {teams.map(team => {
            const tp = teamPicks(team.id)
            const s = standing(team.id)
            const result = playoffResult(team.id, matches, tournament)
            const diff = s ? s.points_for - s.points_against : 0

            return (
              <Link key={team.id} href={`/events/${eventId}/teams/${team.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', height: '100%' }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-strong)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}
                >
                  {/* Team header */}
                  <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--text)' }}>
                        {team.name}
                      </div>
                      <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', marginTop: 1 }}>
                        ♛ {capName(team)}
                      </div>
                    </div>
                    {result && (
                      <span style={{ fontSize: 9, letterSpacing: 1, color: result.color, flexShrink: 0, fontFamily: 'var(--font-body)' }}>
                        {result.label}
                      </span>
                    )}
                  </div>

                  {/* Roster */}
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 6px', borderRadius: 3, background: 'rgba(200,184,122,0.04)' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR['rifle'], flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                        {capName(team)}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--khaki)' }}>♛</span>
                    </div>
                    {tp.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 6px', borderRadius: 3 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: CLS_COLOR[p.class || 'flex'], flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                          {pickName(p)}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                          {CLS_SHORT[p.class || 'flex']}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Stats bar */}
                  {s && (
                    <div style={{ padding: '6px 14px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', display: 'flex', gap: 18 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{s.wins}</div>
                        <div style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-dim)' }}>W</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: 'var(--rust)' }}>{s.losses}</div>
                        <div style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-dim)' }}>L</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 700, color: diff >= 0 ? 'var(--khaki)' : 'var(--rust)' }}>
                          {diff >= 0 ? '+' : ''}{diff}
                        </div>
                        <div style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-dim)' }}>DIFF</div>
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
