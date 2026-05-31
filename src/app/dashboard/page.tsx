'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/Topbar';
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
    if (e.status === 'active' || e.status === 'in_progress') return 'in_progress';
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

  // ── Shared styles ──
  const panel: React.CSSProperties = {
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    boxShadow: '0 2px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
  };

  const modalBtn: React.CSSProperties = {
    padding: '5px 12px', fontSize: 11, letterSpacing: '0.07em',
    textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 3, background: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', fontFamily: 'var(--font-body)',
  };

  function PanelHeader({ title, color, count }: { title: string; color: string; count: number }) {
    return (
      <div style={{ padding: '10px 16px 9px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>{title}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '1px 6px' }}>{count}</span>
      </div>
    );
  }

  function ActionBtn({ children, onClick, variant = 'default', href }: { children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'danger' | 'teal'; href?: string }) {
    const base: React.CSSProperties = { padding: '3px 8px', fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' };
    const variants: Record<string, React.CSSProperties> = {
      default: {},
      primary: { borderColor: 'rgba(200,184,122,0.4)', color: 'var(--khaki)' },
      danger:  { color: 'var(--danger, #c0392b)', borderColor: 'transparent' },
      teal:    { borderColor: 'rgba(67,206,162,0.45)', color: '#43cea2' },
    };
    const style = { ...base, ...variants[variant] };
    if (href) return <Link href={href} style={style} className="db-btn">{children}</Link>;
    return <button style={style} className="db-btn" onClick={onClick}>{children}</button>;
  }

  function EventCard({ event, section }: { event: EventRow; section: Section }) {
    const signupPct = event.capacity ? Math.min(100, Math.round(((event.signup_count ?? 0) / event.capacity) * 100)) : 0;
    const barColor = section === 'in_progress' ? '#43cea2' : 'var(--khaki)';
    const leftAccent = section === 'in_progress'
      ? '2px solid #43cea2'
      : section === 'published'
      ? '2px solid rgba(200,184,122,0.5)'
      : '2px solid rgba(255,255,255,0.06)';

    return (
      <div className="db-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderLeft: leftAccent, borderRadius: 6, padding: '10px 12px', ...(section === 'unpublished' ? { opacity: 0.55 } : {}) }}>
        <div style={{ fontSize: 13, fontFamily: 'var(--font-heading)', color: 'var(--text)', letterSpacing: '0.02em', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          {event.format && <span>{event.format.toUpperCase()}</span>}
          {event.format && event.starts_at && <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'var(--text-dim)', flexShrink: 0, display: 'inline-block' }} />}
          {event.starts_at && <span>{formatDate(event.starts_at)}</span>}
        </div>
        {section !== 'completed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${signupPct}%`, background: barColor, borderRadius: 1 }} />
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
              {event.signup_count ?? 0}/{event.capacity}
              {(event.ringer_count ?? 0) > 0 && ` · ${event.ringer_count}r`}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <ActionBtn href={getNavHref(event)} variant={section === 'in_progress' ? 'teal' : 'default'}>
            {section === 'in_progress' ? 'Resume →' : 'View'}
          </ActionBtn>
          {section !== 'completed' && <ActionBtn href={`/events/${event.id}/edit`}>Edit</ActionBtn>}
          {(section === 'published' || section === 'unpublished') && (
            <ActionBtn variant={section === 'unpublished' ? 'primary' : 'default'} onClick={() => handlePublish(event.id, event.status)}>
              {section === 'published' ? 'Unpublish' : 'Publish'}
            </ActionBtn>
          )}
          {section === 'in_progress' && <ActionBtn variant="danger" onClick={() => setResetModal(event.id)}>Reset</ActionBtn>}
          {section !== 'in_progress' && <ActionBtn variant="danger" onClick={() => setDeleteModal(event.id)}>Delete</ActionBtn>}
        </div>
      </div>
    );
  }

  if (status === 'loading') return null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Topbar />
      <style>{`
        @keyframes db-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .db-section { opacity:0; animation: db-up 0.45s ease forwards; }
        .db-card { transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s; }
        .db-card:hover { border-color: rgba(255,255,255,0.22) !important; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .db-btn { transition: border-color 0.12s, color 0.12s; }
        .db-btn:hover { border-color: rgba(255,255,255,0.2) !important; color: var(--text) !important; }
        .db-new:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(200,184,122,0.3); background: #d4c688 !important; }
        @media (max-width: 768px) {
          .db-main { padding: 20px 16px 60px !important; }
          .db-middle { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '36px 24px 64px' }} className="db-main">

        {/* Header */}
        <div className="db-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, animationDelay: '0s' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, letterSpacing: '0.04em', background: 'linear-gradient(135deg, #a08848 0%, #c8b87a 40%, #ede0a8 60%, #c8b87a 80%, #a08848 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',  }}>
            Organizer Dashboard
          </div>
          <Link href="/events/new" className="db-new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--khaki)', color: '#0e0e0e', border: 'none', borderRadius: 3, fontSize: 11, fontFamily: 'var(--font-body)', letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none', fontWeight: 'bold', transition: 'transform 0.15s, box-shadow 0.15s, background 0.15s' }}>
            + New Event
          </Link>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>Loading events…</div>
        ) : (<>

          {/* IN PROGRESS — full width, hidden when empty */}
          {grouped.in_progress.length > 0 && (
            <div className="db-section" style={{ ...panel, background: 'linear-gradient(180deg,rgba(67,206,162,0.1) 0%,rgba(24,90,157,0.07) 100%)', borderColor: 'rgba(67,206,162,0.18)', marginBottom: 6, animationDelay: '0.05s' }}>
              <PanelHeader title="● In Progress" color="#43cea2" count={grouped.in_progress.length} />
              <div style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {grouped.in_progress.map(e => <EventCard key={e.id} event={e} section="in_progress" />)}
              </div>
            </div>
          )}

          {/* MIDDLE ROW — Unpublished + Published */}
          <div className="db-middle" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>

            <div className="db-section" style={{ ...panel, background: 'linear-gradient(180deg,rgba(126,184,212,0.08) 0%,rgba(24,90,157,0.1) 100%)', borderColor: 'rgba(126,184,212,0.14)', animationDelay: '0.10s' }}>
              <PanelHeader title="— Unpublished" color="var(--text-muted)" count={grouped.unpublished.length} />
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grouped.unpublished.length === 0
                  ? <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '4px 0' }}>No drafts</div>
                  : grouped.unpublished.map(e => <EventCard key={e.id} event={e} section="unpublished" />)
                }
              </div>
            </div>

            <div className="db-section" style={{ ...panel, background: 'linear-gradient(180deg,rgba(200,184,122,0.1) 0%,rgba(24,90,157,0.07) 100%)', borderColor: 'rgba(200,184,122,0.18)', animationDelay: '0.10s' }}>
              <PanelHeader title="○ Published" color="var(--khaki)" count={grouped.published.length} />
              <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grouped.published.length === 0
                  ? <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '4px 0' }}>No published events</div>
                  : grouped.published.map(e => <EventCard key={e.id} event={e} section="published" />)
                }
              </div>
            </div>

          </div>

          {/* COMPLETED — full width */}
          <div className="db-section" style={{ ...panel, background: 'linear-gradient(180deg,rgba(106,76,147,0.1) 0%,rgba(24,90,157,0.07) 100%)', borderColor: 'rgba(106,76,147,0.18)', animationDelay: '0.15s' }}>
            <PanelHeader title="✓ Completed" color="var(--text-dim)" count={grouped.completed.length} />
            <div style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {grouped.completed.length === 0
                ? <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '4px 0' }}>No completed events yet.</div>
                : grouped.completed.map(event => (
                  <div key={event.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 12px', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 180px' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: event.champion_color || 'var(--text-dim)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 1 }}>{event.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{formatDate(event.starts_at)} · {event.format}</div>
                      {event.champion_name && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>Winner: {event.champion_name}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                      <ActionBtn href={getNavHref(event)}>View</ActionBtn>
                      <ActionBtn variant="danger" onClick={() => setDeleteModal(event.id)}>Del</ActionBtn>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

        </>)}
      </main>

      {/* Delete modal */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setDeleteModal(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 28, maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--text)', marginBottom: 10 }}>Delete Event</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>This will permanently delete the event and all associated signups, teams, and draft picks. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={modalBtn} onClick={() => setDeleteModal(null)}>Cancel</button>
              <button style={{ ...modalBtn, color: 'var(--danger, #c0392b)', borderColor: 'currentColor' }} onClick={() => handleDelete(deleteModal)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset draft modal */}
      {resetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setResetModal(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 28, maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--text)', marginBottom: 10 }}>Reset Draft</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>This will clear all draft picks for this event. Teams will be preserved. The draft will restart from pick 1. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={modalBtn} onClick={() => setResetModal(null)}>Cancel</button>
              <button style={{ ...modalBtn, color: 'var(--danger, #c0392b)', borderColor: 'currentColor' }} onClick={() => handleResetDraft(resetModal)}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
