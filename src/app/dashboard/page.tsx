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
}

type Section = 'in_progress' | 'published' | 'unpublished' | 'completed';

const SECTION_ORDER: Section[] = ['in_progress', 'published', 'unpublished', 'completed'];

const SECTION_LABELS: Record<Section, string> = {
  in_progress: 'In Progress',
  published:   'Published',
  unpublished: 'Unpublished',
  completed:   'Completed',
};

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [resetModal, setResetModal] = useState<string | null>(null);

  const isOrganizer = session?.user?.isOrganizer;
  const isSuperUser = (session?.user as any)?.isSuperUser;
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
    if (e.status === 'active' || e.status === 'in_progress') return 'in_progress';
    if (e.status === 'completed') return 'completed';
    if (e.status === 'published') return 'published';
    return 'unpublished';
  }

  function getNavHref(e: EventRow): string {
    if (e.status === 'completed') return `/events/${e.id}/tournament`;
    return `/events/${e.id}`;
  }

  const grouped = SECTION_ORDER.reduce((acc, s) => {
    acc[s] = events.filter(e => getEventSection(e) === s);
    return acc;
  }, {} as Record<Section, EventRow[]>);

  const s: Record<string, React.CSSProperties> = {
    page: {
      minHeight: '100vh',
    },
    main: {
      maxWidth: '860px',
      margin: '0 auto',
      padding: '40px 24px',
    },
    pageHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '36px',
    },
    pageTitle: {
      fontFamily: 'var(--font-heading)',
      fontSize: '22px',
      color: 'var(--text)',
      letterSpacing: '0.04em',
    },
    newEventBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 18px',
      background: 'var(--khaki)',
      color: '#0e0e0e',
      border: 'none',
      borderRadius: '3px',
      fontSize: '12px',
      fontFamily: 'var(--font-body)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      textDecoration: 'none',
      cursor: 'pointer',
      fontWeight: 'bold' as const,
    },
    section: {
      marginBottom: '40px',
    },
    sectionHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      marginBottom: '12px',
    },
    sectionLabel: {
      fontFamily: 'var(--font-heading)',
      fontSize: '11px',
      letterSpacing: '0.14em',
      textTransform: 'uppercase' as const,
      color: 'var(--text-muted)',
    },
    sectionCount: {
      fontSize: '11px',
      color: 'var(--text-dim)',
      background: 'var(--surface2, var(--surface))',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '1px 7px',
    },
    sectionDivider: {
      flex: 1,
      height: '1px',
      background: 'var(--border)',
    },
    emptyState: {
      color: 'var(--text-dim)',
      fontSize: '12px',
      padding: '16px 0',
      letterSpacing: '0.04em',
    },
    eventCard: {
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      padding: '16px 20px',
      marginBottom: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
    },
    eventInfo: {
      flex: 1,
      minWidth: 0,
    },
    eventName: {
      fontSize: '14px',
      color: 'var(--text)',
      fontFamily: 'var(--font-heading)',
      letterSpacing: '0.03em',
      marginBottom: '4px',
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
    eventMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap' as const,
    },
    metaItem: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      letterSpacing: '0.04em',
    },
    signupBar: {
      width: '80px',
      height: '3px',
      background: 'var(--border)',
      borderRadius: '2px',
      overflow: 'hidden',
    },
    signupBarFill: {
      height: '100%',
      background: 'var(--khaki)',
      borderRadius: '2px',
    },
    completedBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      color: 'var(--text-muted)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
    },
    champDot: {
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      flexShrink: 0,
    },
    actions: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexShrink: 0,
    },
    actionBtn: {
      padding: '5px 12px',
      fontSize: '11px',
      letterSpacing: '0.07em',
      textTransform: 'uppercase' as const,
      border: '1px solid var(--border)',
      borderRadius: '3px',
      background: 'none',
      color: 'var(--text-muted)',
      cursor: 'pointer',
      fontFamily: 'var(--font-body)',
      textDecoration: 'none',
      display: 'inline-flex',
      alignItems: 'center',
    },
    actionBtnDanger: {
      color: 'var(--danger, #c0392b)',
      borderColor: 'transparent',
    },
    actionBtnPrimary: {
      borderColor: 'var(--khaki)',
      color: 'var(--khaki)',
    },
    modalOverlay: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
    },
    modal: {
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      padding: '28px',
      maxWidth: '380px',
      width: '100%',
    },
    modalTitle: {
      fontFamily: 'var(--font-heading)',
      fontSize: '16px',
      color: 'var(--text)',
      marginBottom: '10px',
      letterSpacing: '0.03em',
    },
    modalBody: {
      fontSize: '13px',
      color: 'var(--text-muted)',
      marginBottom: '24px',
      lineHeight: '1.6',
    },
    modalActions: {
      display: 'flex',
      gap: '10px',
      justifyContent: 'flex-end',
    },
  };

  if (status === 'loading') return null;

  return (
    <div style={s.page}>
      <Topbar />

      <main style={s.main}>
        <div style={s.pageHeader}>
          <div style={s.pageTitle}>Organizer Dashboard</div>
          <Link href="/events/new" style={s.newEventBtn}>+ New Event</Link>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-dim)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
            Loading events…
          </div>
        ) : (
          SECTION_ORDER.map(section => (
            <div key={section} style={s.section}>
              <div style={s.sectionHeader}>
                <span style={s.sectionLabel}>{SECTION_LABELS[section]}</span>
                <span style={s.sectionCount}>{grouped[section].length}</span>
                <div style={s.sectionDivider} />
              </div>

              {grouped[section].length === 0 ? (
                <div style={s.emptyState}>No events</div>
              ) : (
                grouped[section].map(event => {
                  const signupPct = event.capacity
                    ? Math.min(100, Math.round(((event.signup_count ?? 0) / event.capacity) * 100))
                    : 0;

                  return (
                    <div key={event.id} style={s.eventCard}>
                      <div style={s.eventInfo}>
                        <div style={s.eventName}>{event.name}</div>
                        <div style={s.eventMeta}>
                          {event.format && (
                            <span style={s.metaItem}>{event.format.toUpperCase()}</span>
                          )}
                          {event.starts_at && (
                            <span style={s.metaItem}>
                              {new Date(event.starts_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                              })}
                            </span>
                          )}
                          {section !== 'completed' && (
                            <>
                              <span style={s.metaItem}>
                                {event.signup_count ?? 0}/{event.capacity} players
                                {(event.ringer_count ?? 0) > 0 && ` · ${event.ringer_count} ringers`}
                              </span>
                              <div style={s.signupBar}>
                                <div style={{ ...s.signupBarFill, width: `${signupPct}%` }} />
                              </div>
                            </>
                          )}
                          {section === 'completed' && event.champion_name && (
                            <span style={s.completedBadge}>
                              <span
                                style={{
                                  ...s.champDot,
                                  background: event.champion_color || 'var(--khaki)',
                                }}
                              />
                              DRAFT COMPLETE · WINNER: {event.champion_name.toUpperCase()}
                            </span>
                          )}
                          {section === 'completed' && !event.champion_name && (
                            <span style={s.completedBadge}>DRAFT COMPLETE</span>
                          )}
                        </div>
                      </div>

                      <div style={s.actions}>
                        {/* View / navigate */}
                        <Link href={getNavHref(event)} style={s.actionBtn}>
                          {section === 'in_progress' ? 'Resume →' : 'View'}
                        </Link>

                        {/* Edit — not on completed */}
                        {section !== 'completed' && (
                          <Link href={`/events/${event.id}/edit`} style={s.actionBtn}>
                            Edit
                          </Link>
                        )}

                        {/* Publish / Unpublish */}
                        {(section === 'published' || section === 'unpublished') && (
                          <button
                            style={{ ...s.actionBtn, ...(section === 'published' ? {} : s.actionBtnPrimary) }}
                            onClick={() => handlePublish(event.id, event.status)}
                          >
                            {section === 'published' ? 'Unpublish' : 'Publish'}
                          </button>
                        )}

                        {/* Reset draft — in_progress only */}
                        {section === 'in_progress' && (
                          <button
                            style={{ ...s.actionBtn, ...s.actionBtnDanger }}
                            onClick={() => setResetModal(event.id)}
                          >
                            Reset Draft
                          </button>
                        )}

                        {/* Delete */}
                        {section !== 'in_progress' && (
                          <button
                            style={{ ...s.actionBtn, ...s.actionBtnDanger }}
                            onClick={() => setDeleteModal(event.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ))
        )}
      </main>

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div style={s.modalOverlay} onClick={() => setDeleteModal(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Delete Event</div>
            <div style={s.modalBody}>
              This will permanently delete the event and all associated signups, teams, and draft picks. This cannot be undone.
            </div>
            <div style={s.modalActions}>
              <button style={s.actionBtn} onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                style={{ ...s.actionBtn, ...s.actionBtnDanger, border: '1px solid currentColor' }}
                onClick={() => handleDelete(deleteModal)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset draft confirmation modal */}
      {resetModal && (
        <div style={s.modalOverlay} onClick={() => setResetModal(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>Reset Draft</div>
            <div style={s.modalBody}>
              This will clear all draft picks for this event. Teams will be preserved. The draft will restart from pick 1. This cannot be undone.
            </div>
            <div style={s.modalActions}>
              <button style={s.actionBtn} onClick={() => setResetModal(null)}>Cancel</button>
              <button
                style={{ ...s.actionBtn, ...s.actionBtnDanger, border: '1px solid currentColor' }}
                onClick={() => handleResetDraft(resetModal)}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
