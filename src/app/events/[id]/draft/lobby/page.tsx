'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Spinner } from '@/components/Spinner'

interface Team {
  id: string
  name: string
  color: string
  pick_order: number
  captain_id: string | null
  captain: { ingame_name: string | null; discord_username: string } | null
  captain_ready: boolean
}

interface LobbyData {
  event: { status: string; name: string } | null
  teams: Team[]
  readyCount: number
  totalCaptains: number
  allReady: boolean
}

function captainName(team: Team): string {
  return team.captain?.ingame_name || team.captain?.discord_username || '?'
}

export default function DraftLobbyPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const eventId = params.id

  const [lobby, setLobby] = useState<LobbyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [readying, setReadying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [myReady, setMyReady] = useState(false)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)

  const isAdmin = !!(session?.user?.isOrganizer || session?.user?.isSuperUser)
  const myUserId = session?.user?.userId

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/draft/${eventId}/lobby`)
      if (!res.ok) return
      const data: LobbyData = await res.json()
      setLobby(data)
      setLoading(false)

      if (!data.teams || data.teams.length === 0) {
        router.replace(`/events/${eventId}/teams`)
        return
      }

      if (data.event?.status === 'drafting') {
        router.replace(`/events/${eventId}/draft`)
        return
      }

      const myTeam = data.teams.find(t => t.captain_id === myUserId)
      if (myTeam?.captain_ready) setMyReady(true)
    } catch (e) {
      console.error('lobby poll error', e)
    }
  }, [eventId, myUserId, router])

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/'); return }
    if (status !== 'authenticated') return
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [status, poll, router])

  async function markReady() {
    if (readying || myReady) return
    setReadying(true)
    const res = await fetch(`/api/draft/${eventId}/lobby/ready`, { method: 'POST' })
    setReadying(false)
    if (res.ok) {
      setMyReady(true)
      poll()
    } else {
      const d = await res.json()
      showToast(d.error || 'Failed to ready up', true)
    }
  }

  async function startDraft() {
    if (starting) return
    setStarting(true)
    const res = await fetch(`/api/draft/${eventId}/lobby/start`, { method: 'POST' })
    if (res.ok) {
      router.push(`/events/${eventId}/draft`)
    } else {
      setStarting(false)
      const d = await res.json()
      showToast(d.error || 'Failed to start draft', true)
    }
  }

  function showToast(msg: string, err = false) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 2500)
  }

  if (status === 'loading' || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  const sortedTeams = [...(lobby?.teams ?? [])].sort((a, b) => a.pick_order - b.pick_order)
  const myTeam = sortedTeams.find(t => t.captain_id === myUserId)
  const isCaptain = !!myTeam && !isAdmin

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>

      {/* TOPBAR */}
      <header style={{
        height: 46, background: 'var(--surface)',
        borderBottom: '1px solid var(--border)', borderLeft: '3px solid var(--khaki)',
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 6,
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link href="/dashboard" style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 15, letterSpacing: '0.06em', color: 'var(--khaki)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          DRAFTMAN5.0
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ color: 'var(--border-strong)', padding: '0 4px' }}>›</span>
          <Link href="/events" style={{ color: 'var(--text-dim)', textDecoration: 'none', padding: '0 4px' }}>Events</Link>
          <span style={{ color: 'var(--border-strong)', padding: '0 4px' }}>›</span>
          <Link href={`/events/${eventId}`} style={{ color: 'var(--text-dim)', textDecoration: 'none', padding: '0 4px' }}>
            {lobby?.event?.name || 'Event'}
          </Link>
          <span style={{ color: 'var(--border-strong)', padding: '0 4px' }}>›</span>
          <span style={{ color: 'var(--text)', padding: '0 4px' }}>Draft Lobby</span>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {session?.user?.discordId && session?.user?.discordAvatar
            ? <img
                src={`https://cdn.discordapp.com/avatars/${session.user.discordId}/${session.user.discordAvatar}.png`}
                style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border-strong)' }}
                alt=""
              />
            : <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--surface2)', border: '1px solid var(--border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-heading)', fontSize: 11, color: 'var(--khaki)',
              }}>
                {(session?.user?.ingameName || session?.user?.discordUsername || '?')[0].toUpperCase()}
              </div>
          }
          <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
            {session?.user?.ingameName || session?.user?.discordUsername}
          </span>
        </div>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 60px', width: '100%' }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--khaki)', marginBottom: 6 }}>
            {lobby?.event?.name}
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 26, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Draft Lobby
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
            {lobby?.allReady
              ? 'All captains are ready.'
              : isCaptain && !myReady
                ? "Click Ready when you're good to go."
                : isCaptain && myReady
                  ? "You're ready — waiting for the others."
                  : isAdmin
                    ? 'Waiting for captains to ready up.'
                    : 'Hang tight — the draft is about to begin.'}
          </div>
        </div>

        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 4,
          marginBottom: 24, fontSize: 11,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: lobby?.allReady ? 'var(--green-light)' : 'var(--steel)',
            animation: 'lobbyPulse 2s ease-in-out infinite',
          }} />
          <span style={{ color: lobby?.allReady ? 'var(--green-light)' : 'var(--steel)' }}>
            {lobby?.allReady ? 'All captains ready' : 'Waiting for captains'}
          </span>
          <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>·</span>
          <span>{lobby?.readyCount ?? 0} of {lobby?.totalCaptains ?? 0} ready</span>
          <span style={{ color: 'var(--text-dim)', margin: '0 2px' }}>·</span>
          <span style={{ color: 'var(--text-dim)' }}>Updates every 3s</span>
        </div>

        {/* Team grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8, marginBottom: 28 }}>
          {sortedTeams.map(team => {
            const isMyTeam = team.captain_id === myUserId && !isAdmin
            return (
              <div key={team.id} style={{
                background: 'var(--surface2)',
                border: `1px solid ${isMyTeam ? 'var(--steel)' : team.captain_ready ? 'rgba(90,156,90,0.35)' : 'var(--border)'}`,
                borderRadius: 4, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: team.captain_id ? 1 : 0.4,
                transition: 'border-color 0.2s',
              }}>
                <div style={{ width: 3, height: 36, borderRadius: 2, background: team.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 3 }}>
                    {team.name} <span style={{ color: 'var(--border-strong)' }}>· Pick {team.pick_order}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'var(--khaki)', fontSize: 9 }}>♛</span>
                    {team.captain_id
                      ? <span>{captainName(team)}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>No captain assigned</span>
                    }
                    {isMyTeam && (
                      <span style={{ fontSize: 9, color: 'var(--steel)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>— You</span>
                    )}
                  </div>
                </div>
                {team.captain_id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: team.captain_ready ? 'var(--green-light)' : 'var(--border-strong)' }} />
                    <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: team.captain_ready ? 'var(--green-light)' : 'var(--text-dim)' }}>
                      {team.captain_ready ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Captain ready button */}
        {isCaptain && !myReady && (
          <button
            onClick={markReady}
            disabled={readying}
            style={{
              width: '100%', padding: 14,
              background: 'rgba(90,156,90,0.1)', border: '1px solid var(--green-light)',
              color: 'var(--green-light)', fontSize: 11, letterSpacing: '0.16em',
              textTransform: 'uppercase', borderRadius: 4,
              cursor: readying ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)', marginBottom: 8,
              opacity: readying ? 0.6 : 1, transition: 'background 0.15s',
            }}
          >
            {readying ? 'Confirming…' : "✓ I'm Ready — Let's Draft"}
          </button>
        )}

        {isCaptain && myReady && (
          <div style={{
            width: '100%', padding: 14, textAlign: 'center',
            background: 'rgba(90,156,90,0.05)', border: '1px solid rgba(90,156,90,0.2)',
            color: 'rgba(90,156,90,0.55)', fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', borderRadius: 4, marginBottom: 8,
            fontFamily: 'var(--font-body)',
          }}>
            ✓ You're Ready — waiting for the others
          </div>
        )}

        {/* Admin controls */}
        {isAdmin && (
          <>
            <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12 }}>
              Admin Controls
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={startDraft}
                disabled={!lobby?.allReady || starting}
                style={{
                  flex: 1, padding: '10px 20px',
                  background: lobby?.allReady ? 'rgba(90,156,90,0.1)' : 'transparent',
                  border: `1px solid ${lobby?.allReady ? 'var(--green-light)' : 'var(--border)'}`,
                  color: lobby?.allReady ? 'var(--green-light)' : 'var(--text-dim)',
                  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  borderRadius: 3, fontFamily: 'var(--font-body)',
                  cursor: lobby?.allReady && !starting ? 'pointer' : 'not-allowed',
                  opacity: starting ? 0.6 : 1, transition: 'all 0.15s',
                }}
              >
                {starting ? 'Starting…' : 'Start Draft →'}
              </button>
              <button
                onClick={startDraft}
                disabled={starting}
                style={{
                  padding: '10px 18px', background: 'transparent',
                  border: '1px solid var(--border)', color: 'var(--text-dim)',
                  fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                  borderRadius: 3, fontFamily: 'var(--font-body)',
                  cursor: starting ? 'not-allowed' : 'pointer',
                }}
              >
                Force Start ({lobby?.readyCount}/{lobby?.totalCaptains})
              </button>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--surface)', border: `1px solid var(--border-strong)`,
          borderLeft: `3px solid ${toast.err ? 'var(--rust)' : 'var(--green-light)'}`,
          color: 'var(--text)', fontFamily: 'var(--font-body)',
          fontSize: 12, padding: '10px 16px', borderRadius: 3, zIndex: 999,
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes lobbyPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }`}</style>
    </div>
  )
}
