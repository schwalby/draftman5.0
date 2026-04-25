'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Topbar } from '@/components/Topbar'
import { Spinner } from '@/components/Spinner'

interface UserProfile {
  id: string
  ingame_name: string | null
  discord_username: string
  discord_avatar: string | null
  discord_id: string | null
  is_organizer: boolean
  is_superuser: boolean
  is_captain: boolean
  created_at: string
}

interface SignupRecord {
  id: string
  class: string[]
  priority: number
  ringer: boolean
  captain: boolean
  flagged: boolean
  checked_in: boolean
  signed_up_at: string
  events: {
    id: string
    name: string
    starts_at: string | null
    format: string
    status: string
  } | null
}

interface DraftPickRecord {
  id: string
  pick_number: number
  class: string | null
  picked_at: string
  events: { id: string; name: string; starts_at: string | null; format: string } | null
  teams: { id: string; name: string; color: string } | null
}

const CLASS_COLORS: Record<string, string> = {
  rifle: '#c8a050', light: '#4a9c6a', third: '#4a9c6a',
  heavy: '#9c5a4a', sniper: '#5a6a9c', flex: '#888888',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PlayerProfilePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [signups, setSignups] = useState<SignupRecord[]>([])
  const [draftPicks, setDraftPicks] = useState<DraftPickRecord[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = session?.user?.isOrganizer || (session?.user as any)?.isSuperUser

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
    if (status === 'authenticated' && !isAdmin) router.replace('/portal')
  }, [status, isAdmin, router])

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(data => {
        setProfile(data.user)
        setSignups(data.signups || [])
        setDraftPicks(data.draftPicks || [])
      })
      .finally(() => setLoading(false))
  }, [status, userId, isAdmin])

  if (status === 'loading' || loading) {
    return (
      <>
        <Topbar items={[{ label: 'Player Profile', href: '#' }]} />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>
      </>
    )
  }

  if (!profile) {
    return (
      <>
        <Topbar items={[{ label: 'Player Profile', href: '#' }]} />
        <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-dim)' }}>Player not found.</div>
      </>
    )
  }

  const displayName = profile.ingame_name || profile.discord_username
  const avatarUrl = profile.discord_id && profile.discord_avatar
    ? `https://cdn.discordapp.com/avatars/${profile.discord_id}/${profile.discord_avatar}.png`
    : null

  const roleLabel = profile.is_superuser ? 'SuperUser' : profile.is_organizer ? 'Draft Admin' : profile.is_captain ? 'Captain' : 'Player'
  const roleColor = profile.is_superuser ? 'var(--rust)' : profile.is_organizer ? 'var(--khaki)' : 'var(--text-dim)'

  // Class frequency from signups
  const classCount: Record<string, number> = {}
  signups.forEach(s => s.class?.forEach(c => { classCount[c] = (classCount[c] || 0) + 1 }))

  const draftedEvents = new Set(draftPicks.map(p => p.events?.id).filter(Boolean))

  return (
    <>
      <Topbar items={[
        { label: 'Players', href: '/dashboard' },
        { label: displayName, href: `/portal/${userId}` },
      ]} />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>

        {/* Profile header */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '24px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          {/* Avatar */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
            background: 'var(--surface2)', border: '2px solid var(--border-strong)',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--khaki)',
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : displayName[0]?.toUpperCase()
            }
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--text)', lineHeight: 1, marginBottom: 6 }}>
              {displayName}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{
                fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 8px', borderRadius: 2,
                border: `1px solid ${roleColor}33`, color: roleColor,
                fontFamily: 'var(--font-body)',
              }}>{roleLabel}</span>
              {profile.discord_username && (
                <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                  @{profile.discord_username}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                Joined {formatDate(profile.created_at)}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
            {[
              { label: 'Signups', value: signups.length },
              { label: 'Drafted', value: draftedEvents.size },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--khaki)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Class breakdown */}
        {Object.keys(classCount).length > 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 12, fontFamily: 'var(--font-heading)' }}>
              Classes Signed Up As
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {Object.entries(classCount).sort((a, b) => b[1] - a[1]).map(([cls, count]) => (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: CLASS_COLORS[cls] || '#888' }} />
                  <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                    {cls.charAt(0).toUpperCase() + cls.slice(1)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>×{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Draft History */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--text-dim)', paddingBottom: 8,
            borderBottom: '1px solid var(--border)', marginBottom: 12,
            fontFamily: 'var(--font-heading)',
          }}>Draft History</div>

          {draftPicks.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No draft history yet.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {draftPicks.map(pick => (
                <div key={pick.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${pick.teams?.color || 'var(--border)'}`,
                  borderRadius: 4, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{pick.events?.name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 10 }}>
                      <span>{formatDate(pick.events?.starts_at || null)}</span>
                      <span>{pick.events?.format}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flex: 'column', alignItems: 'flex-end', gap: 4, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                      Team <span style={{ color: pick.teams?.color || 'var(--text)' }}>{pick.teams?.name}</span>
                    </div>
                    {pick.class && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: CLASS_COLORS[pick.class] || '#888' }} />
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{pick.class.charAt(0).toUpperCase() + pick.class.slice(1)}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Pick #{pick.pick_number}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Signup History */}
        <div>
          <div style={{
            fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--text-dim)', paddingBottom: 8,
            borderBottom: '1px solid var(--border)', marginBottom: 12,
            fontFamily: 'var(--font-heading)',
          }}>Signup History</div>

          {signups.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No signups yet.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {signups.map(signup => (
                <div key={signup.id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{signup.events?.name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 10 }}>
                      <span>{formatDate(signup.events?.starts_at || null)}</span>
                      <span>{signup.events?.format}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(signup.class || []).map((cls, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: CLASS_COLORS[cls] || '#888' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{cls.charAt(0).toUpperCase() + cls.slice(1)}</span>
                        </div>
                      ))}
                    </div>
                    {signup.ringer && <span style={{ fontSize: 10, color: '#5a6a9c', border: '1px solid #5a6a9c44', borderRadius: 2, padding: '1px 5px' }}>Ringer</span>}
                    {signup.captain && <span style={{ fontSize: 10, color: 'var(--khaki)', border: '1px solid var(--border-strong)', borderRadius: 2, padding: '1px 5px' }}>♛ Captain</span>}
                    {signup.checked_in && <span style={{ fontSize: 10, color: 'var(--green-light)', border: '1px solid rgba(90,156,90,0.4)', borderRadius: 2, padding: '1px 5px' }}>✓ Checked in</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </>
  )
}
