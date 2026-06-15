'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import Link from 'next/link';

interface EventRow {
  id: string;
  name: string;
  status: string;
  starts_at: string | null;
  format: string | null;
  capacity: number;
  signup_count?: number;
  ringer_count?: number;
  champion_name?: string | null;
  champion_color?: string | null;
  has_picks?: boolean;
}

type Section = 'in_progress' | 'published' | 'unpublished' | 'completed';
const SECTION_ORDER: Section[] = ['in_progress', 'published', 'unpublished', 'completed'];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [resetModal, setResetModal] = useState<string | null>(null);

  const isOrganizer = session?.user?.isOrganizer;
  const isSuperUser = session?.user?.isSuperUser;
  const isAdmin = isOrganizer || isSuperUser;

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/'); return; }
    if (status === 'authenticated' && !isAdmin) { router.push('/portal'); return; }
  }, [status, isAdmin, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
    fetchEvents();
  }, [status, isAdmin]);

  async function fetchEvents() {
    setLoading(true);
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : data.events ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function handlePublish(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'published' ? 'draft' : 'published';
    await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchEvents();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' });
    setDeleteModal(null);
    fetchEvents();
  }

  async function handleResetDraft(id: string) {
    await fetch(`/api/draft/${id}/reset`, { method: 'DELETE' });
    setResetModal(null);
    fetchEvents();
  }

  function getEventSection(e: EventRow): Section {
    if (e.status === 'completed') return 'completed';
    if (e.status === 'active' || e.status === 'in_progress' || e.status === 'drafting' || e.status === 'lobby') return 'in_progress';
    if (e.status === 'published' && e.has_picks) return 'in_progress';
    if (e.status === 'published') return 'published';
    return 'unpublished';
  }

  function getNavHref(e: EventRow): string {
    if (e.status === 'completed') return `/events/${e.id}/summary`;
    return `/events/${e.id}`;
  }

  const grouped = SECTION_ORDER.reduce((acc, s) => {
    acc[s] = events.filter(e => getEventSection(e) === s);
    return acc;
  }, {} as Record<Section, EventRow[]>);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // derived
  const activeList = [...grouped.in_progress, ...grouped.published, ...grouped.unpublished];
  const totalSignups = activeList.reduce((sum, e) => sum + (e.signup_count ?? 0), 0);
  const hero = grouped.in_progress[0] ?? null;

  function sectionOf(e: EventRow): Exclude<Section, 'completed'> {
    const s = getEventSection(e);
    return (s === 'completed' ? 'published' : s);
  }

  function StatusTag({ e }: { e: EventRow }) {
    const s = sectionOf(e);
    if (s === 'in_progress') return <span className="tag teal"><span className="sig teal live" /> Live</span>;
    if (s === 'published') return <span className="tag">Published</span>;
    return <span className="tag dim">Draft</span>;
  }

  function RowActions({ e }: { e: EventRow }) {
    const s = sectionOf(e);
    return (
      <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Link href={getNavHref(e)} className={`rbtn sm ${s === 'in_progress' ? 'primary' : ''}`}>
          {s === 'in_progress' ? 'Resume' : 'View'}
        </Link>
        <Link href={`/events/${e.id}/edit`} className="rbtn sm">Edit</Link>
        {(s === 'published' || s === 'unpublished') && (
          <button className="rbtn sm" onClick={() => handlePublish(e.id, e.status)}>
            {s === 'published' ? 'Unpublish' : 'Publish'}
          </button>
        )}
        {s === 'in_progress'
          ? <button className="rbtn sm danger" onClick={() => setResetModal(e.id)}>Reset</button>
          : <button className="rbtn sm danger" onClick={() => setDeleteModal(e.id)}>Delete</button>}
      </div>
    );
  }

  if (status === 'loading') return null;

  return (
    <AppShell crumbs={[{ label: 'Home' }]}>
      <main className="canvas">

        {/* heading */}
        <div className="pagehead">
          <div>
            <div className="crumb">Workspace · <b>Home</b></div>
            <h1>Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isSuperUser && <Link href="/admin/audit" className="rbtn">Audit log</Link>}
            <Link href="/events/new" className="rbtn primary">+ New Event</Link>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading events…</div>
        ) : (<>

          {/* KPI tiles */}
          <div className="tiles">
            <div className="tile"><div className="l">Active events</div><div className="v" style={{ color: 'var(--khaki)' }}>{activeList.length}</div></div>
            <div className="tile"><div className="l">Signups (active)</div><div className="v">{totalSignups}</div></div>
            <div className="tile dim"><div className="l">In progress</div><div className="v">{grouped.in_progress.length}</div></div>
            <div className="tile violet"><div className="l">Completed</div><div className="v">{grouped.completed.length}</div></div>
          </div>

          {/* live hero */}
          {hero && (() => {
            const pct = hero.capacity ? Math.min(100, Math.round(((hero.signup_count ?? 0) / hero.capacity) * 100)) : 0;
            return (
              <div className="hero"><div className="inner">
                <span className="tag teal"><span className="sig teal live" /> Live</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, color: 'var(--text)' }}>{hero.name}</div>
                  <div className="meta">{hero.format ? hero.format.toUpperCase() : ''}{hero.starts_at ? ` · ${formatDate(hero.starts_at)}` : ''} · {hero.signup_count ?? 0}/{hero.capacity} signed up</div>
                  <div className="bar" style={{ marginTop: 8, maxWidth: 360 }}><i style={{ width: `${pct}%` }} /></div>
                </div>
                <Link href={getNavHref(hero)} className="rbtn primary">▶ Resume</Link>
              </div></div>
            );
          })()}

          <div className="g2">
            {/* events table */}
            <div>
              <div className="card">
                <div className="ch"><span className="t">Events</span><span className="code">{activeList.length} active</span></div>
                {activeList.length === 0 ? (
                  <div className="cb meta">No open events. Create one to get started.</div>
                ) : (
                  <table>
                    <thead><tr><th>Event</th><th>Date</th><th>Format</th><th style={{ width: 150 }}>Signups</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                    <tbody>
                      {activeList.map(e => {
                        const pct = e.capacity ? Math.min(100, Math.round(((e.signup_count ?? 0) / e.capacity) * 100)) : 0;
                        return (
                          <tr key={e.id}>
                            <td><div className="name">{e.name}</div></td>
                            <td className="meta" style={{ whiteSpace: 'nowrap' }}>{formatDate(e.starts_at)}</td>
                            <td className="meta">{e.format ? e.format.toUpperCase() : '—'}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                                <span className="meta" style={{ whiteSpace: 'nowrap' }}>{e.signup_count ?? 0}/{e.capacity}{(e.ringer_count ?? 0) > 0 ? ` · ${e.ringer_count}r` : ''}</span>
                              </div>
                            </td>
                            <td><StatusTag e={e} /></td>
                            <td style={{ textAlign: 'right' }}><RowActions e={e} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* right rail */}
            <div>
              <div className="card">
                <div className="ch"><span className="t">Completed</span><span className="code">{grouped.completed.length}</span></div>
                {grouped.completed.length === 0 ? (
                  <div className="cb meta">No completed events yet.</div>
                ) : (
                  <div>
                    {grouped.completed.map(e => (
                      <div key={e.id} className="feeditem">
                        <span className="sig" style={{ background: e.champion_color || 'var(--text-muted)' }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div className="name" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                          <div className="meta" style={{ fontSize: 10 }}>{formatDate(e.starts_at)}{e.champion_name ? ` · 🏆 ${e.champion_name}` : ''}</div>
                        </div>
                        <Link href={getNavHref(e)} className="rbtn sm">View</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="ch"><span className="t">Snapshot</span></div>
                <div className="cb" style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="meta">In progress</span><span style={{ color: 'var(--khaki)' }}>{grouped.in_progress.length}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="meta">Published</span><span>{grouped.published.length}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="meta">Unpublished</span><span>{grouped.unpublished.length}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="meta">Total active signups</span><span>{totalSignups}</span></div>
                </div>
              </div>
            </div>
          </div>

        </>)}
      </main>

      {/* Delete modal */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setDeleteModal(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: 28, maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--text)', marginBottom: 10 }}>Delete Event</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>This will permanently delete the event and all associated signups, teams, and picks. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="rbtn" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button className="rbtn danger" onClick={() => handleDelete(deleteModal)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset draft modal */}
      {resetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setResetModal(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 12, padding: 28, maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--text)', marginBottom: 10 }}>Reset Picks</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>This will clear all picks and ready states for this event. Teams and captains will be preserved. Captains will need to re-ready in the lobby before picking can restart. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="rbtn" onClick={() => setResetModal(null)}>Cancel</button>
              <button className="rbtn danger" onClick={() => handleResetDraft(resetModal)}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
