'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Topbar } from '@/components/Topbar';
import SignupDrawer from '@/components/SignupDrawer';

function Spinner() {
  return <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--khaki)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Event {
  id: string;
  name: string;
  type: string;
  format: string;
  status: string;
  half_length: number;
  starts_at: string | null;
  signup_opens_at: string | null;
  checkin_opens_at: string | null;
  maps: string[];
  slots_rifle: number;
  slots_third: number;
  slots_heavy: number;
  slots_sniper: number;
  capacity: number;
  notes: string | null;
}

interface Signup {
  id: string;
  user_id: string;
  class: string[];
  priority: number;
  flagged: boolean;
  ringer: boolean;
  users: {
    ingame_name: string | null;
    discord_username: string;
  };
}

const CLASS_COLORS: Record<string, string> = {
  rifle:  '#c8a050',
  light:  '#4a9c6a',
  third:  '#4a9c6a',
  heavy:  '#9c5a4a',
  sniper: '#5a6a9c',
  flex:   '#888888',
};

const CLASSES = ['rifle', 'third', 'heavy', 'sniper', 'flex'];

export default function EventPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [mySignup, setMySignup] = useState<Signup | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftInProgress, setDraftInProgress] = useState(false);
  const [tournamentExists, setTournamentExists] = useState(false);
  const [hasSteamId, setHasSteamId] = useState<boolean | null>(null); // null = loading

  const isOrganizer = session?.user?.isOrganizer;
  const userId = session?.user?.userId;
  const confirmedCap = event?.capacity ?? 48;

  const nonRingers = signups.filter(s => !s.ringer);
  const adminRingers = signups.filter(s => s.ringer);
  const confirmed = nonRingers.slice(0, confirmedCap);
  const ringers = [...nonRingers.slice(confirmedCap), ...adminRingers];

  useEffect(() => {
    const fetchEvent = async () => {
      const res = await fetch(`/api/events/${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setEvent(data.event ?? data);
      }
    };
    const fetchSignups = async () => {
      const res = await fetch(`/api/events/${eventId}/signups`);
      if (res.ok) {
        const data: Signup[] = await res.json();
        const sorted = [...data].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        setSignups(sorted);
        if (userId) {
          const mine = sorted.find(s => s.user_id === userId) ?? null;
          setMySignup(mine);
          if (mine) setSelectedClasses(mine.class ?? []);
        }
      }
      setLoading(false);
    };
    const fetchPicks = async () => {
      const res = await fetch(`/api/draft/${eventId}/picks`);
      if (res.ok) {
        const data = await res.json();
        setDraftInProgress(Array.isArray(data) && data.length > 0);
      }
    };
    const fetchTournament = async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('id')
        .eq('event_id', eventId)
        .maybeSingle();
      setTournamentExists(!!data);
    };
    const fetchSteamId = async () => {
      const res = await fetch('/api/users/me');
      if (res.ok) {
        const data = await res.json();
        setHasSteamId(!!data?.steam_id);
      } else {
        setHasSteamId(false);
      }
    };
    fetchEvent();
    fetchSignups();
    fetchPicks();
    fetchTournament();
    if (session) fetchSteamId();
  }, [eventId, userId, session]);

  // Realtime signups
  useEffect(() => {
    const channel = supabase
      .channel(`signups:${eventId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'signups',
        filter: `event_id=eq.${eventId}`,
      }, () => {
        fetch(`/api/events/${eventId}/signups`)
          .then(r => r.json())
          .then((data: Signup[]) => {
            const sorted = [...data].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
            setSignups(sorted);
            if (userId) {
              const mine = sorted.find(s => s.user_id === userId) ?? null;
              setMySignup(mine);
            }
          });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId, userId]);

  const toggleClass = (cls: string) => {
    setSelectedClasses(prev => {
      if (prev.includes(cls)) return prev.filter(c => c !== cls);
      if (cls === 'flex') return ['flex'];
      if (prev.includes('flex')) return [cls];
      if (prev.length >= 2) return prev;
      return [...prev, cls];
    });
  };

  const handleSignup = async () => {
    if (!session || selectedClasses.length === 0) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    if (mySignup) {
      await fetch(`/api/events/${eventId}/signups`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } else {
      await fetch(`/api/events/${eventId}/signups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class: selectedClasses }),
      });
    }
    const res = await fetch(`/api/events/${eventId}/signups`);
    if (res.ok) {
      const data = await res.json();
      const sorted = [...data].sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));
      setSignups(sorted);
      const mine = sorted.find((s: any) => s.user_id === userId) ?? null;
      setMySignup(mine);
      if (mine) setSelectedClasses(mine.class ?? []);
      else setSelectedClasses([]);
    }
    setSubmitting(false);
    submittingRef.current = false;
  };

  function getActionButton(): { label: string; href: string } | null {
    if (!isOrganizer) return null;
    if (event?.status === 'completed' || tournamentExists) {
      return { label: '▶ Go to Draft', href: `/events/${eventId}/tournament` };
    }
    if (draftInProgress) {
      return { label: '▶ Rejoin Draft', href: `/events/${eventId}/draft` };
    }
    return { label: '⚑ Set Up Teams', href: `/events/${eventId}/teams` };
  }

  const actionButton = getActionButton();
  const displayName = (s: Signup) => s.users?.ingame_name || s.users?.discord_username || 'Unknown';

  if (loading) return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Topbar items={[{ label: 'Events', href: '/dashboard' }]} />
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>
    </>
  );

  if (!event) return (
    <>
      <Topbar items={[{ label: 'Events', href: '/dashboard' }]} />
      <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-dim)' }}>Event not found.</div>
    </>
  );

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const statusLabel = (() => {
    if (draftInProgress && !tournamentExists) return 'Draft In Progress'
    if (tournamentExists && event.status !== 'completed') return 'Games Active'
    if (event.status === 'completed') return 'Draft Complete'
    if (event.status === 'scheduled') return 'Scheduled'
    return event.status
  })()

  const statusColor = (() => {
    if (event.status === 'completed') return 'var(--text-dim)'
    if (tournamentExists) return '#3ddc84'
    if (draftInProgress) return 'var(--green-light)'
    if (event.status === 'scheduled') return 'var(--khaki)'
    return 'var(--text-dim)'
  })()

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Topbar items={[
        { label: 'Events', href: '/dashboard' },
        { label: event.name, href: `/events/${eventId}` },
      ]} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px' }}>

        {/* Event header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 36, color: 'var(--text)', marginBottom: 6 }}>
                {event.name}
              </h1>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Pill>{event.type}</Pill>
                <Pill>{event.format}</Pill>
                <Pill>{event.half_length} min</Pill>
                <Pill color={statusColor}>{statusLabel}</Pill>
              </div>
            </div>

            {isOrganizer && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setDrawerOpen(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '8px 16px', borderRadius: 4,
                    border: '0.5px solid var(--border-strong)',
                    background: 'var(--surface2)', color: 'var(--khaki)',
                    fontSize: 13, fontFamily: 'var(--font-body)',
                    cursor: 'pointer', letterSpacing: '0.04em',
                  }}
                >
                  ⠿ Manage Signups
                </button>
                {actionButton && (
                  <button
                    onClick={() => window.location.href = actionButton.href}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      padding: '8px 16px', borderRadius: 4,
                      border: '0.5px solid var(--border-strong)',
                      background: 'var(--surface2)', color: 'var(--khaki)',
                      fontSize: 13, fontFamily: 'var(--font-body)',
                      cursor: 'pointer', letterSpacing: '0.04em',
                    }}
                  >
                    {actionButton.label}
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px 24px' }}>
            <MetaRow label="Draft date" value={formatDate(event.starts_at)} />
            <MetaRow label="Signup opens" value={formatDate(event.signup_opens_at)} />
            <MetaRow label="Check-in opens" value={formatDate(event.checkin_opens_at)} />
          </div>

          {event.notes && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 4, border: '0.5px solid var(--border)', fontSize: 13, color: 'var(--text-dim)' }}>
              {event.notes}
            </div>
          )}
        </div>

        {/* Signup form */}
        {session && (
          draftInProgress ? (
            <div style={{
              background: 'rgba(90,156,90,0.06)',
              border: '1px solid rgba(90,156,90,0.3)',
              borderRadius: 6, padding: '16px 20px',
              marginBottom: 28,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 16 }}>🔒</span>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--green-light)', marginBottom: 2 }}>
                  Draft in progress
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)' }}>
                  Signups are closed. The draft is currently underway.
                </div>
              </div>
            </div>
          ) : !hasSteamId && !mySignup ? (
            /* No Steam ID — block signup */
            <div style={{
              background: 'rgba(200,132,42,0.06)',
              border: '1px solid rgba(200,132,42,0.35)',
              borderRadius: 6, padding: '16px 20px',
              marginBottom: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#c8842a', marginBottom: 2 }}>
                  Steam ID required to sign up
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-dim)' }}>
                  Add your Steam ID in the Player Portal before signing up for events.
                </div>
              </div>
              <button
                onClick={() => router.push('/portal')}
                style={{
                  padding: '7px 14px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                  fontSize: 11, fontFamily: 'var(--font-body)',
                  background: 'rgba(200,132,42,0.1)', color: '#c8842a',
                  border: '0.5px solid rgba(200,132,42,0.4)',
                }}
              >
                Go to Portal →
              </button>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 6, padding: '20px', marginBottom: 28 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: 14 }}>
                {mySignup ? 'Your Signup — click to update or withdraw' : 'Sign Up — select up to 2 classes'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {CLASSES.map(cls => {
                  const selected = selectedClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      onClick={() => toggleClass(cls)}
                      style={{
                        padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
                        fontSize: 12, fontFamily: 'var(--font-body)', letterSpacing: '0.04em',
                        background: selected ? CLASS_COLORS[cls] + '22' : 'transparent',
                        color: selected ? CLASS_COLORS[cls] : 'var(--text-dim)',
                        border: `0.5px solid ${selected ? CLASS_COLORS[cls] : 'var(--border)'}`,
                      }}
                    >
                      {cls.charAt(0).toUpperCase() + cls.slice(1)}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {mySignup ? (
                  <button
                    onClick={handleSignup}
                    disabled={submitting}
                    style={{
                      padding: '7px 18px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 500,
                      background: 'transparent', color: 'var(--rust)',
                      border: '0.5px solid var(--rust)',
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting ? '...' : 'Withdraw Signup'}
                  </button>
                ) : (
                  <button
                    onClick={handleSignup}
                    disabled={submitting || selectedClasses.length === 0}
                    style={{
                      padding: '7px 18px', borderRadius: 4,
                      cursor: selectedClasses.length === 0 ? 'not-allowed' : 'pointer',
                      fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 500,
                      background: 'var(--khaki)', color: '#1a1a14', border: 'none',
                      opacity: submitting || selectedClasses.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {submitting ? '...' : 'Sign Up'}
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {/* Player list */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: 'var(--text)' }}>
              Players Signed Up
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {confirmed.length} confirmed{ringers.length > 0 ? ` · ${ringers.length} ringer${ringers.length > 1 ? 's' : ''}` : ''}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {Object.entries(CLASS_COLORS).filter(([c]) => c !== 'light').map(([cls, color]) => (
              <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                {cls.charAt(0).toUpperCase() + cls.slice(1)}
              </div>
            ))}
          </div>

          {confirmed.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '20px 0' }}>No signups yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '2px 12px', marginBottom: 24 }}>
              {confirmed.map((s, idx) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 18, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {idx + 1}
                  </span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {(s.class || []).map((cls, i) => (
                      <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: CLASS_COLORS[cls] || '#888', display: 'inline-block', flexShrink: 0 }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName(s)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {ringers.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>Ringer List</span>
                <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '2px 12px' }}>
                {ringers.map((s, idx) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', opacity: 0.65 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', width: 18, flexShrink: 0, textAlign: 'right' }}>
                      {confirmedCap + idx + 1}
                    </span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {(s.class || []).map((cls, i) => (
                        <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: CLASS_COLORS[cls] || '#888', display: 'inline-block' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName(s)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {isOrganizer && (
        <SignupDrawer
          eventId={eventId}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 3,
      border: '0.5px solid var(--border)',
      color: color || 'var(--text-dim)',
      fontFamily: 'var(--font-body)', letterSpacing: '0.04em', textTransform: 'uppercase',
    }}>
      {children}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>
    </div>
  );
}
