'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/Topbar'
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

function roleBadge(u: User) {
  if (u.is_superuser) return { label: '★ SuperUser', color: 'var(--khaki)', bg: 'rgba(200,184,122,0.08)', border: 'rgba(200,184,122,0.35)' }
  if (u.is_organizer) return { label: '⚙ Draft Admin', color: 'var(--light)', bg: 'rgba(74,156,106,0.08)', border: 'rgba(74,156,106,0.35)' }
  return { label: 'Player', color: 'var(--text-dim)', bg: 'transparent', border: 'var(--border)' }
}

function avatarUrl(u: User) {
  if (u.discord_id && u.discord_avatar) {
    return `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar}.png`
  }
  return null
}

function joinedDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
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
  const [showTestAccounts, setShowTestAccounts] = useState(false)

  // ── Auth gate ──────────────────────────────────────────────────
  // We check is_superuser from the DB directly on load — not from session
  // since isSuperUser isn't in the session token yet
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/')
    }
  }, [status, router])

  // ── Fetch users ────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/users')
    if (res.status === 403) {
      // Not a SuperUser — send them away
      router.replace('/dashboard')
      return
    }
    if (res.ok) {
      const data = await res.json()
      setUsers(data)
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchUsers()
    }
  }, [status, fetchUsers])

  // ── Toast helper ───────────────────────────────────────────────
  function showToast(msg: string, error = false) {
    setToast({ msg, error })
    setTimeout(() => setToast(null), 2800)
  }

  // ── Toggle handler — opens modal ───────────────────────────────
  function requestToggle(
    userId: string,
    field: 'is_organizer' | 'is_superuser',
    newVal: boolean,
    userName: string
  ) {
    setModal({ userId, field, newVal, userName })
  }

  // ── Confirm modal ──────────────────────────────────────────────
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

    // Update local state
    setUsers(prev =>
      prev.map(u => {
        if (u.id !== modal.userId) return u
        const updated = { ...u, [modal.field]: modal.newVal }
        // SuperUser promotion auto-grants Draft Admin
        if (modal.field === 'is_superuser' && modal.newVal) {
          updated.is_organizer = true
        }
        return updated
      })
    )

    const fieldLabel = modal.field === 'is_organizer' ? 'Draft Admin' : 'SuperUser'
    const action = modal.newVal ? 'granted' : 'revoked'
    showToast(`${modal.userName} — ${fieldLabel} ${action}`)
    setModal(null)
  }

  // ── Filtered users ─────────────────────────────────────────────
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

  // ── Modal content ──────────────────────────────────────────────
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

  // ── DEV: Seed a test draft ─────────────────────────────────────
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

  if (status === 'loading' || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  return (
    <>
      <Topbar items={[{ label: 'Settings', href: '/settings' }]} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px' }}>

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text)', lineHeight: 1 }}>
              USER ROLES
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
              Manage Draft Admin and SuperUser access for all registered players.
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: '0.1em',
            color: 'var(--text-dim)', background: 'var(--surface)',
            border: '1px solid var(--border)', padding: '5px 12px', borderRadius: 3, flexShrink: 0
          }}>
            <strong style={{ color: 'var(--khaki)' }}>{users.length}</strong> REGISTERED USERS
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 12, pointerEvents: 'none' }}>⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or Discord…"
              style={{
                width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12,
                padding: '8px 12px 8px 30px', borderRadius: 3, outline: 'none'
              }}
            />
          </div>
          {(['all', 'admin', 'superuser'] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontFamily: 'var(--font-heading)', fontSize: 10, letterSpacing: '0.1em',
                padding: '7px 14px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase',
                border: filter === f ? '1px solid var(--khaki)' : '1px solid var(--border)',
                background: filter === f ? 'rgba(200,184,122,0.07)' : 'transparent',
                color: filter === f ? 'var(--khaki)' : 'var(--text-dim)',
              }}
            >
              {f === 'all' ? 'All' : f === 'admin' ? 'Draft Admins' : 'SuperUsers'}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {['PLAYER', 'JOINED', 'CURRENT ROLE', 'DRAFT ADMIN', 'SUPERUSER'].map((h, i) => (
                  <th key={h} style={{
                    fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.18em',
                    color: 'var(--text-dim)', padding: '10px 16px', textAlign: i >= 3 ? 'center' : 'left',
                    fontWeight: 500, textTransform: 'uppercase'
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {realUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 28, fontSize: 12 }}>
                    No users match this filter.
                  </td>
                </tr>
              ) : realUsers.map((u, idx) => {
                const isSelf = u.id === session?.user?.userId
                const badge = roleBadge(u)
                const pfp = avatarUrl(u)
                const displayName = u.ingame_name || u.discord_username
                const initial = displayName[0].toUpperCase()

                return (
                  <tr key={u.id} style={{ borderBottom: idx < realUsers.length - 1 ? '1px solid var(--border)' : 'none' }}>

                    {/* Player cell */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--surface2)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--khaki)',
                          flexShrink: 0, overflow: 'hidden'
                        }}>
                          {pfp
                            ? <img src={pfp} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initial
                          }
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--text)' }}>{displayName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.discord_username}</div>
                        </div>
                      </div>
                    </td>

                    {/* Joined */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{joinedDate(u.created_at)}</span>
                    </td>

                    {/* Role badge */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.12em',
                        textTransform: 'uppercase', padding: '3px 8px', borderRadius: 2,
                        color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`,
                        display: 'inline-block'
                      }}>{badge.label}</span>
                    </td>

                    {/* Draft Admin toggle */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <Toggle
                        checked={u.is_organizer}
                        color="green"
                        onChange={val => requestToggle(u.id, 'is_organizer', val, displayName)}
                      />
                    </td>

                    {/* SuperUser toggle */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {isSelf ? (
                        <div style={{ position: 'relative', display: 'inline-flex' }} title="You can't remove your own SuperUser access">
                          <Toggle checked={true} disabled />
                        </div>
                      ) : (
                        <Toggle
                          checked={u.is_superuser}
                          onChange={val => requestToggle(u.id, 'is_superuser', val, displayName)}
                        />
                      )}
                    </td>

                  </tr>
                )
              })}

              {/* Test accounts toggle row */}
              {fakeUsers.length > 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <button
                      onClick={() => setShowTestAccounts(p => !p)}
                      style={{
                        width: '100%', padding: '10px 16px', background: 'var(--surface2)',
                        border: 'none', borderTop: '1px solid var(--border)',
                        color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: 11,
                        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 10 }}>{showTestAccounts ? '▾' : '▸'}</span>
                      {showTestAccounts ? 'Hide' : 'Show'} test accounts ({fakeUsers.length})
                    </button>
                  </td>
                </tr>
              )}

              {/* Fake users — collapsed by default */}
              {showTestAccounts && fakeUsers.map((u, idx) => {
                const isSelf = u.id === session?.user?.userId
                const badge = roleBadge(u)
                const pfp = avatarUrl(u)
                const displayName = u.ingame_name || u.discord_username
                const initial = displayName[0].toUpperCase()

                return (
                  <tr key={u.id} style={{ borderBottom: idx < fakeUsers.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.6 }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'var(--surface2)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-heading)', fontSize: 11, color: 'var(--text-dim)',
                          flexShrink: 0,
                        }}>
                          {pfp ? <img src={pfp} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{displayName}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', opacity: 0.6 }}>{u.discord_username}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{joinedDate(u.created_at)}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 2, color: 'var(--text-dim)', background: 'transparent', border: '1px solid var(--border)', display: 'inline-block' }}>test</span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <Toggle checked={u.is_organizer} color="green" onChange={val => requestToggle(u.id, 'is_organizer', val, displayName)} />
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {isSelf
                        ? <div style={{ position: 'relative', display: 'inline-flex' }}><Toggle checked={true} disabled /></div>
                        : <Toggle checked={u.is_superuser} onChange={val => requestToggle(u.id, 'is_superuser', val, displayName)} />
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

        {/* ── DEV TOOLS ── remove before going live ───────────────── */}
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 48px' }}>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--rust)' }}>
                ⚠ DEV TOOLS
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Remove this section before going live. SuperUser only.
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--rust)', borderRadius: 4, padding: '20px 24px' }}>
              <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 4, fontWeight: 500 }}>Seed Test Draft</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16, lineHeight: 1.6 }}>
                Creates a 6v6 event, signs up all fake users, creates 8 teams, runs a full snake draft, then drops you at tournament setup. Uses existing fake users (discord_id starting with 1000000000000000).
              </div>
              <button
                onClick={seedTestDraft}
                disabled={seeding}
                style={{
                  fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: '0.12em',
                  textTransform: 'uppercase', padding: '8px 20px', borderRadius: 3,
                  border: '1px solid var(--rust)', color: seeding ? 'var(--text-dim)' : 'var(--rust)',
                  background: seeding ? 'transparent' : 'rgba(192,57,43,0.08)',
                  cursor: seeding ? 'not-allowed' : 'pointer', opacity: seeding ? 0.6 : 1,
                }}
              >
                {seeding ? '⏳ Seeding...' : '⚡ Generate Test Draft'}
              </button>
              {seedLog.length > 0 && (
                <div style={{ marginTop: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, padding: '10px 14px' }}>
                  {seedLog.map((line, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: line.startsWith('❌') ? 'var(--rust)' : line.startsWith('✓') ? 'var(--green-light)' : 'var(--text-dim)', lineHeight: 1.8 }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* ── END DEV TOOLS ─────────────────────────────────────── */}

      {/* ── Confirm modal ───────────────────────────────────────── */}
      {modal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
          }}
        >
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-strong)',
            borderTop: '2px solid var(--khaki)', borderRadius: 4, padding: '24px 28px', width: 360
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text)', marginBottom: 10 }}>
              {modalAction} {modalFieldLabel} access
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 20 }}>
              This will {modal.newVal ? 'give' : 'remove'} <strong style={{ color: 'var(--text)' }}>{modal.userName}</strong> {modalDesc}
              <br /><br />Are you sure?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: '0.12em',
                  textTransform: 'uppercase', padding: '8px 18px', borderRadius: 3,
                  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer'
                }}
              >Cancel</button>
              <button
                onClick={confirmToggle}
                disabled={saving}
                style={{
                  fontFamily: 'var(--font-heading)', fontSize: 11, letterSpacing: '0.12em',
                  textTransform: 'uppercase', padding: '8px 18px', borderRadius: 3, cursor: 'pointer',
                  border: modal.newVal ? '1px solid var(--khaki)' : '1px solid var(--rust)',
                  background: modal.newVal ? 'rgba(200,184,122,0.12)' : 'rgba(192,57,43,0.12)',
                  color: modal.newVal ? 'var(--khaki)' : 'var(--rust)',
                  opacity: saving ? 0.6 : 1
                }}
              >{saving ? 'Saving…' : modalAction}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--surface)', border: '1px solid var(--border-strong)',
          borderLeft: `3px solid ${toast.error ? 'var(--rust)' : 'var(--green-light)'}`,
          color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12,
          padding: '10px 16px', borderRadius: 3, zIndex: 999,
          animation: 'slideUp 0.2s ease'
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

// ── Toggle component ─────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  color = 'khaki',
  disabled = false,
}: {
  checked: boolean
  onChange?: (val: boolean) => void
  color?: 'khaki' | 'green'
  disabled?: boolean
}) {
  const activeColor = color === 'green' ? '#4a9c6a' : 'var(--khaki)'
  const activeBg = color === 'green' ? 'rgba(74,156,106,0.2)' : 'rgba(200,184,122,0.2)'

  return (
    <label style={{ position: 'relative', width: 36, height: 20, display: 'inline-block', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange?.(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background: checked ? activeBg : 'var(--surface2)',
        border: `1px solid ${checked ? activeColor : 'var(--border)'}`,
        borderRadius: 20,
        transition: 'background 0.2s, border-color 0.2s'
      }}>
        <div style={{
          position: 'absolute', top: 2,
          left: checked ? 18 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: checked ? activeColor : 'var(--text-dim)',
          transition: 'left 0.2s, background 0.2s'
        }} />
      </div>
    </label>
  )
}
