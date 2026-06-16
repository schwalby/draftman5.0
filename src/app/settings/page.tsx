'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Spinner } from '@/components/Spinner'

interface User {
  id: string
  discord_id: string
  discord_avatar: string | null
  discord_username: string
  ingame_name: string | null
  is_organizer: boolean
  is_superuser: boolean
  created_at: string
}

type FilterType = 'all' | 'admin' | 'superuser'

function avatarUrl(u: User) {
  if (u.discord_id && u.discord_avatar) {
    return `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png`
  }
  return null
}

function joinedDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function RoleTag({ u }: { u: User }) {
  if (u.is_superuser) return <span className="tag violet">SuperUser</span>
  if (u.is_organizer) return <span className="tag teal">Organizer</span>
  return <span className="tag dim">Player</span>
}

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null)
  const [modal, setModal] = useState<{
    userId: string
    field: 'is_organizer' | 'is_superuser'
    newVal: boolean
    userName: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedLog, setSeedLog] = useState<string[]>([])
  const [seedingSignups, setSeedingSignups] = useState(false)
  const [seedSignupsLog, setSeedSignupsLog] = useState<string[]>([])
  const [showTestAccounts, setShowTestAccounts] = useState(false)

  // Fake bot result state
  const [botEvents, setBotEvents] = useState<{ id: string; name: string }[]>([])
  const [botEventId, setBotEventId] = useState('')
  const [botMatches, setBotMatches] = useState<{ id: string; label: string; tournamentId: string }[]>([])
  const [botMatchId, setBotMatchId] = useState('')
  const [botTournamentId, setBotTournamentId] = useState('')
  const [botScore1, setBotScore1] = useState('')
  const [botScore2, setBotScore2] = useState('')
  const [botSubmitting, setBotSubmitting] = useState(false)
  const [botMsg, setBotMsg] = useState<{ text: string; err?: boolean } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/users')
    if (res.status === 403) { router.replace('/dashboard'); return }
    if (res.ok) { const data = await res.json(); setUsers(data) }
    setLoading(false)
  }, [router])

  useEffect(() => {
    if (status === 'authenticated') fetchUsers()
  }, [status, fetchUsers])

  function showToast(msg: string, error = false) {
    setToast({ msg, error })
    setTimeout(() => setToast(null), 2800)
  }

  function requestToggle(userId: string, field: 'is_organizer' | 'is_superuser', newVal: boolean, userName: string) {
    setModal({ userId, field, newVal, userName })
  }

  async function confirmToggle() {
    if (!modal) return
    setSaving(true)
    const res = await fetch(`/api/users/${modal.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [modal.field]: modal.newVal }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      showToast(data.error || 'Something went wrong', true)
      setModal(null)
      return
    }
    setUsers(prev => prev.map(u => {
      if (u.id !== modal.userId) return u
      const updated = { ...u, [modal.field]: modal.newVal }
      if (modal.field === 'is_superuser' && modal.newVal) updated.is_organizer = true
      return updated
    }))
    const fieldLabel = modal.field === 'is_organizer' ? 'Draft Admin' : 'SuperUser'
    const action = modal.newVal ? 'granted' : 'revoked'
    showToast(`${modal.userName} — ${fieldLabel} ${action}`)
    setModal(null)
  }

  const visible = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch =
      (u.ingame_name ?? '').toLowerCase().includes(q) ||
      u.discord_username.toLowerCase().includes(q)
    const matchFilter =
      filter === 'all' ? true :
      filter === 'admin' ? u.is_organizer :
      filter === 'superuser' ? u.is_superuser : true
    return matchSearch && matchFilter
  })

  const realUsers = visible.filter(u => !u.discord_id?.startsWith('1000000000000000'))
  const fakeUsers = visible.filter(u => u.discord_id?.startsWith('1000000000000000'))

  const organizerCount = users.filter(u => u.is_organizer).length
  const superCount = users.filter(u => u.is_superuser).length
  const playerCount = users.filter(u => !u.is_organizer && !u.is_superuser).length

  const modalFieldLabel = modal?.field === 'is_organizer' ? 'Draft Admin' : 'SuperUser'
  const modalAction = modal?.newVal ? 'Grant' : 'Revoke'
  const modalDesc = modal
    ? modal.field === 'is_organizer'
      ? modal.newVal
        ? 'the ability to create and manage events.'
        : 'their Draft Admin access. They will no longer be able to create or manage events.'
      : modal.newVal
        ? 'full SuperUser privileges — including the ability to manage other users\' roles.'
        : 'their SuperUser access.'
    : ''

  // ── DEV: Seed event + signups only ──
  async function seedSignupsOnly() {
    setSeedingSignups(true)
    setSeedSignupsLog([])
    const log = (msg: string) => setSeedSignupsLog(prev => [...prev, msg])
    try {
      log('Creating event...')
      const res = await fetch('/api/admin/seed-signups', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { log(`❌ ${data.error ?? 'Failed'}`); setSeedingSignups(false); return }
      log(`✓ Event created: ${data.eventName}`)
      log(`✓ Fake users signed up`)
      log('No teams or picks — ready to test the draft flow.')
      log('Redirecting to event...')
      setTimeout(() => router.push(`/events/${data.eventId}`), 800)
    } catch (e) {
      log(`❌ Error: ${String(e)}`)
      setSeedingSignups(false)
    }
  }

  // ── DEV: Seed a test draft ──
  async function seedTestDraft() {
    setSeeding(true)
    setSeedLog([])
    const log = (msg: string) => setSeedLog(prev => [...prev, msg])
    try {
      log('Generating test draft...')
      const res = await fetch('/api/admin/seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { log(`❌ ${data.error ?? 'Failed'}`); setSeeding(false); return }
      log(`✓ Event created: ${data.eventName}`)
      log('✓ Players signed up')
      log('✓ Teams created')
      log('✓ Draft complete')
      log('Redirecting to tournament setup...')
      setTimeout(() => router.push(`/events/${data.eventId}/tournament-setup`), 800)
    } catch (e) {
      log(`❌ Error: ${String(e)}`)
      setSeeding(false)
    }
  }

  // ── DEV: Fake bot result ──
  async function loadBotEvents() {
    const res = await fetch('/api/events')
    if (!res.ok) return
    const data = await res.json()
    const evts = (Array.isArray(data) ? data : data.events ?? [])
      .filter((e: any) => e.status === 'in_progress' || e.status === 'active' || e.status === 'scheduled')
    setBotEvents(evts.map((e: any) => ({ id: e.id, name: e.name })))
  }

  async function loadBotMatches(eventId: string) {
    setBotMatchId('')
    setBotMatches([])
    setBotTournamentId('')
    const tRes = await fetch(`/api/tournaments?event_id=${eventId}`)
    if (!tRes.ok) return
    const tData = await tRes.json()
    const tournament = Array.isArray(tData) ? tData[0] : tData.tournament ?? tData
    if (!tournament?.id) return
    setBotTournamentId(tournament.id)
    const mRes = await fetch(`/api/tournaments/${tournament.id}/matches`)
    if (!mRes.ok) return
    const mData = await mRes.json()
    const matches = Array.isArray(mData) ? mData : mData.matches ?? []
    const pending = matches.filter((m: any) => m.status === 'pending' || m.status === 'in_progress')
    setBotMatches(pending.map((m: any) => ({
      id: m.id,
      tournamentId: tournament.id,
      label: `${m.team1?.name ?? 'TBD'} vs ${m.team2?.name ?? 'TBD'} (${m.stage} R${m.round})`,
    })))
  }

  async function submitFakeResult() {
    if (!botMatchId || !botTournamentId || botScore1 === '' || botScore2 === '') return
    setBotSubmitting(true)
    setBotMsg(null)
    const res = await fetch(`/api/tournaments/${botTournamentId}/matches/${botMatchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'report', score_team1: parseInt(botScore1), score_team2: parseInt(botScore2) }),
    })
    setBotSubmitting(false)
    if (res.ok) {
      setBotMsg({ text: '✓ Result submitted — check Confirm Queue on the draft page' })
      setBotScore1(''); setBotScore2(''); setBotMatchId('')
    } else {
      const d = await res.json()
      setBotMsg({ text: `❌ ${d.error ?? 'Failed'}`, err: true })
    }
  }

  if (status === 'loading' || loading) {
    return (
      <AppShell crumbs={[{ label: 'Settings' }]}>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
      </AppShell>
    )
  }

  function UserRow({ u, dim }: { u: User; dim?: boolean }) {
    const isSelf = u.id === session?.user?.userId
    const pfp = avatarUrl(u)
    const displayName = u.ingame_name || u.discord_username
    const initial = displayName[0].toUpperCase()
    return (
      <tr style={dim ? { opacity: 0.6 } : undefined}>
        <td>
          <div className="user">
            <div className="av">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {pfp ? <img src={pfp} alt={displayName} /> : initial}
            </div>
            <div><div className="nm">{displayName}</div><div className="sub">{u.discord_username}</div></div>
          </div>
        </td>
        <td className="meta" style={{ whiteSpace: 'nowrap' }}>{joinedDate(u.created_at)}</td>
        <td><RoleTag u={u} /></td>
        <td style={{ textAlign: 'center' }}>
          <Toggle checked={u.is_organizer} color="green" onChange={val => requestToggle(u.id, 'is_organizer', val, displayName)} />
        </td>
        <td style={{ textAlign: 'center' }}>
          {isSelf
            ? <span title="You can't remove your own SuperUser access"><Toggle checked disabled /></span>
            : <Toggle checked={u.is_superuser} onChange={val => requestToggle(u.id, 'is_superuser', val, displayName)} />}
        </td>
      </tr>
    )
  }

  const devCardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--rust)', borderRadius: 12, padding: '18px 20px', marginBottom: 12 }
  const devBtnStyle = (busy: boolean): React.CSSProperties => ({
    fontFamily: 'var(--font-body)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 16px', borderRadius: 7, border: '1px solid rgba(255,93,108,0.4)',
    color: busy ? 'var(--text-dim)' : 'var(--rust)', background: busy ? 'transparent' : 'rgba(255,93,108,0.1)',
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
  })
  const devInput: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12 }

  return (
    <AppShell crumbs={[{ label: 'Settings' }]}>
      <main className="canvas">

        {/* heading */}
        <div className="pagehead">
          <div>
            <div className="crumb">SuperUser · <b>Access control</b></div>
            <h1>Settings</h1>
          </div>
          <input className="rinput" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members…" style={{ minWidth: 220 }} />
        </div>

        {/* tiles */}
        <div className="tiles">
          <div className="tile"><div className="l">Total members</div><div className="v">{users.length}</div></div>
          <div className="tile"><div className="l">Organizers</div><div className="v" style={{ color: 'var(--khaki)' }}>{organizerCount}</div></div>
          <div className="tile violet"><div className="l">SuperUsers</div><div className="v" style={{ color: 'var(--acc2)' }}>{superCount}</div></div>
          <div className="tile dim"><div className="l">Players</div><div className="v">{playerCount}</div></div>
        </div>

        {/* members */}
        <div className="card">
          <div className="ch">
            <span className="t">Members</span>
            <div className="tabs">
              {(['all', 'admin', 'superuser'] as FilterType[]).map(f => (
                <button key={f} className={`tb ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'admin' ? 'Organizers' : 'SuperUsers'}
                </button>
              ))}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Member</th><th>Joined</th><th>Role</th>
                <th style={{ textAlign: 'center' }}>Organizer</th><th style={{ textAlign: 'center' }}>SuperUser</th>
              </tr>
            </thead>
            <tbody>
              {realUsers.length === 0 ? (
                <tr><td colSpan={5} className="meta" style={{ textAlign: 'center', padding: 24 }}>No users match this filter.</td></tr>
              ) : realUsers.map(u => <UserRow key={u.id} u={u} />)}

              {fakeUsers.length > 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <button onClick={() => setShowTestAccounts(p => !p)}
                      style={{ width: '100%', padding: '10px 15px', background: 'var(--surface2)', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 11, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10 }}>{showTestAccounts ? '▾' : '▸'}</span>
                      {showTestAccounts ? 'Hide' : 'Show'} test accounts ({fakeUsers.length})
                    </button>
                  </td>
                </tr>
              )}
              {showTestAccounts && fakeUsers.map(u => <UserRow key={u.id} u={u} dim />)}
            </tbody>
          </table>
        </div>

        {/* ── DEV TOOLS ── */}
        <div style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--rust)', letterSpacing: '0.04em' }}>⚠ Dev Tools</div>
            <div className="meta">Remove this section before going live.</div>
          </div>

          <div style={devCardStyle}>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4, fontWeight: 500 }}>Seed Test Draft</div>
            <div className="meta" style={{ marginBottom: 14, lineHeight: 1.6 }}>Creates a 6v6 event, signs up all fake users, creates 8 teams, runs a full snake draft, then drops you at tournament setup.</div>
            <button onClick={seedTestDraft} disabled={seeding} style={devBtnStyle(seeding)}>{seeding ? '⏳ Seeding...' : '⚡ Generate Test Draft'}</button>
            {seedLog.length > 0 && (
              <div style={{ marginTop: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 14px' }}>
                {seedLog.map((line, i) => <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: line.startsWith('❌') ? 'var(--rust)' : line.startsWith('✓') ? 'var(--green-light)' : 'var(--text-dim)', lineHeight: 1.8 }}>{line}</div>)}
              </div>
            )}
          </div>

          <div style={devCardStyle}>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4, fontWeight: 500 }}>Seed Signups Only</div>
            <div className="meta" style={{ marginBottom: 14, lineHeight: 1.6 }}>Creates a 6v6 event and signs up all fake users — no teams, no picks. Use this to test the full draft flow from scratch.</div>
            <button onClick={seedSignupsOnly} disabled={seedingSignups} style={devBtnStyle(seedingSignups)}>{seedingSignups ? '⏳ Seeding...' : '⚡ Generate Signups Only'}</button>
            {seedSignupsLog.length > 0 && (
              <div style={{ marginTop: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 14px' }}>
                {seedSignupsLog.map((line, i) => <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: line.startsWith('❌') ? 'var(--rust)' : line.startsWith('✓') ? 'var(--green-light)' : 'var(--text-dim)', lineHeight: 1.8 }}>{line}</div>)}
              </div>
            )}
          </div>

          <div style={devCardStyle}>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4, fontWeight: 500 }}>Fake Bot Result</div>
            <div className="meta" style={{ marginBottom: 14, lineHeight: 1.6 }}>Submit a match score as if the KTP Score Bot reported it. Result goes to Awaiting Confirmation — then confirm it on the draft page.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={botEventId} onChange={e => { setBotEventId(e.target.value); if (e.target.value) loadBotMatches(e.target.value) }} onClick={() => { if (botEvents.length === 0) loadBotEvents() }} style={{ ...devInput, flex: 1, cursor: 'pointer', color: botEventId ? 'var(--text)' : 'var(--text-dim)' }}>
                  <option value=''>Select event…</option>
                  {botEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button onClick={loadBotEvents} style={{ ...devInput, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>↺ Refresh</button>
              </div>
              {botEventId && (
                <select value={botMatchId} onChange={e => setBotMatchId(e.target.value)} style={{ ...devInput, cursor: 'pointer', color: botMatchId ? 'var(--text)' : 'var(--text-dim)' }}>
                  <option value=''>Select match…</option>
                  {botMatches.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              )}
              {botMatchId && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type='number' min={0} placeholder='Score Team 1' value={botScore1} onChange={e => setBotScore1(e.target.value)} style={{ ...devInput, width: 130 }} />
                  <span className="meta">vs</span>
                  <input type='number' min={0} placeholder='Score Team 2' value={botScore2} onChange={e => setBotScore2(e.target.value)} style={{ ...devInput, width: 130 }} />
                  <button onClick={submitFakeResult} disabled={botSubmitting || botScore1 === '' || botScore2 === ''} style={devBtnStyle(botSubmitting || botScore1 === '' || botScore2 === '')}>{botSubmitting ? '⏳ Submitting...' : '⚡ Submit Result'}</button>
                </div>
              )}
              {botMsg && <div style={{ fontSize: 11, color: botMsg.err ? 'var(--rust)' : 'var(--green-light)', fontFamily: 'var(--font-body)' }}>{botMsg.text}</div>}
            </div>
          </div>
        </div>
      </main>

      {/* ── Confirm modal ── */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) setModal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderTop: '2px solid var(--khaki)', borderRadius: 12, padding: '24px 28px', width: 360 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--text)', marginBottom: 10 }}>{modalAction} {modalFieldLabel} access</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 20 }}>
              This will {modal.newVal ? 'give' : 'remove'} <strong style={{ color: 'var(--text)' }}>{modal.userName}</strong> {modalDesc}<br /><br />Are you sure?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="rbtn" onClick={() => setModal(null)}>Cancel</button>
              <button className={`rbtn ${modal.newVal ? 'primary' : 'danger'}`} onClick={confirmToggle} disabled={saving}>{saving ? 'Saving…' : modalAction}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderLeft: `3px solid ${toast.error ? 'var(--rust)' : 'var(--green-light)'}`, color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12, padding: '10px 16px', borderRadius: 7, zIndex: 999 }}>
          {toast.msg}
        </div>
      )}
    </AppShell>
  )
}

// ── Toggle component ──
function Toggle({ checked, onChange, color = 'khaki', disabled = false }: {
  checked: boolean; onChange?: (val: boolean) => void; color?: 'khaki' | 'green'; disabled?: boolean
}) {
  const activeColor = color === 'green' ? 'var(--green, #36d399)' : 'var(--khaki)'
  const activeBg = color === 'green' ? 'rgba(54,211,153,0.2)' : 'rgba(35,227,192,0.2)'
  return (
    <label style={{ position: 'relative', width: 36, height: 20, display: 'inline-block', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange?.(e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
      <div style={{ position: 'absolute', inset: 0, background: checked ? activeBg : 'var(--surface2)', border: `1px solid ${checked ? activeColor : 'var(--border)'}`, borderRadius: 20, transition: 'background 0.2s, border-color 0.2s' }}>
        <div style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: checked ? activeColor : 'var(--text-dim)', transition: 'left 0.2s, background 0.2s' }} />
      </div>
    </label>
  )
}
