'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface Signup {
  id: string;
  user_id: string;
  class: string[];
  priority: number;
  flagged: boolean;
  ringer: boolean;
  captain: boolean;
  admin_note: string | null;
  checked_in: boolean;
  users: {
    ingame_name: string | null;
    discord_username: string;
  };
}

interface Props {
  eventId: string;
  isOpen: boolean;
  onClose: () => void;
  capacity?: number;
  onUpdate?: () => void;
}

const CLASS_COLORS: Record<string, string> = {
  rifle:  '#c8a050',
  third:  '#4a9c6a',
  heavy:  '#9c5a4a',
  sniper: '#5a6a9c',
  flex:   '#888888',
};

export default function SignupDrawer({ eventId, isOpen, onClose, capacity = 48, onUpdate }: Props) {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const dragId = useRef<string | null>(null);
  const orderRef = useRef<string[]>([]);
  const ghostRef = useRef<HTMLDivElement>(null);

  const confirmed = signups.filter(s => !s.ringer);
  const ringers   = signups.filter(s =>  s.ringer);

  const fetchSignups = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/events/${eventId}/signups`);
    if (res.ok) {
      const data: Signup[] = await res.json();
      const sorted = [...data].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      setSignups(sorted);
      orderRef.current = sorted.map(s => s.id);
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (isOpen) fetchSignups();
  }, [isOpen, fetchSignups]);

  const patch = useCallback(async (signupId: string, updates: Record<string, unknown>) => {
    setSaving(signupId);
    await fetch(`/api/events/${eventId}/signups/${signupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    setSaving(null);
  }, [eventId]);

  const toggleFlag = async (s: Signup) => {
    setSignups(prev => prev.map(p => p.id === s.id ? { ...p, flagged: !p.flagged } : p));
    await patch(s.id, { flagged: !s.flagged });
  };

  const toggleRinger = async (s: Signup) => {
    setSignups(prev => prev.map(p => p.id === s.id ? { ...p, ringer: !p.ringer } : p));
    await patch(s.id, { ringer: !s.ringer });
    onUpdate?.();
  };

  const toggleCaptain = async (s: Signup) => {
    setSignups(prev => prev.map(p => p.id === s.id ? { ...p, captain: !p.captain } : p));
    await patch(s.id, { captain: !s.captain });
  };

  const openNoteFor = (s: Signup) => {
    setOpenNote(s.id);
    setNoteText(s.admin_note ?? '');
  };

  const saveNote = async (s: Signup) => {
    const trimmed = noteText.trim();
    setSignups(prev => prev.map(p => p.id === s.id ? { ...p, admin_note: trimmed || null } : p));
    setOpenNote(null);
    await patch(s.id, { admin_note: trimmed || null });
  };

  const cancelNote = () => { setOpenNote(null); setNoteText(''); };

  const displayName = (s: Signup) => s.users.ingame_name || s.users.discord_username;

  const handleDragStart = (e: React.DragEvent, id: string, name: string) => {
    dragId.current = id;
    if (ghostRef.current) {
      ghostRef.current.textContent = name;
      ghostRef.current.style.display = 'block';
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(new Image(), 0, 0);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId.current || dragId.current === targetId) return;
    const order = [...orderRef.current];
    const fi = order.indexOf(dragId.current);
    const ti = order.indexOf(targetId);
    if (fi === -1 || ti === -1) return;
    order.splice(fi, 1);
    order.splice(ti, 0, dragId.current);
    orderRef.current = order;
    setSignups(prev => {
      const map = new Map(prev.map(s => [s.id, s]));
      return order.map(id => map.get(id)!).filter(Boolean);
    });
  };

  const handleDragEnd = async () => {
    if (ghostRef.current) ghostRef.current.style.display = 'none';
    const order = orderRef.current;
    dragId.current = null;
    const updates = order.map((id, idx) => patch(id, { priority: idx + 1 }));
    await Promise.all(updates);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (ghostRef.current && ghostRef.current.style.display === 'block') {
      ghostRef.current.style.left = (e.nativeEvent.offsetX + 12) + 'px';
      ghostRef.current.style.top  = (e.nativeEvent.offsetY - 10) + 'px';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: 100,
        display: 'flex', justifyContent: 'flex-end',
      }} onClick={onClose}>
        <div style={{
          width: 480, background: 'var(--surface)', borderLeft: '0.5px solid var(--border-strong)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
        }} onClick={e => e.stopPropagation()} onMouseMove={handleMouseMove}>

          {/* Ghost drag label */}
          <div ref={ghostRef} style={{
            display: 'none', position: 'absolute', pointerEvents: 'none', zIndex: 200,
            background: 'var(--surface2)', border: '0.5px solid var(--khaki)',
            borderRadius: 4, padding: '5px 10px', fontSize: 12,
            color: 'var(--text)', whiteSpace: 'nowrap',
          }} />

          {/* Header */}
          <div style={{
            height: 44, padding: '0 16px', flexShrink: 0,
            borderBottom: '0.5px solid var(--border)',
            borderLeft: '3px solid var(--khaki)',
            background: 'var(--surface2)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text)' }}>
              Signup Manager
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
              {confirmed.length} / {capacity} confirmed
            </span>
            <button onClick={onClose} style={{
              marginLeft: 'auto', width: 26, height: 26, borderRadius: 4,
              border: '0.5px solid var(--border)', background: 'transparent',
              cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              {Object.entries(CLASS_COLORS).map(([cls, color]) => (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {cls.charAt(0).toUpperCase() + cls.slice(1)}
                </div>
              ))}
            </div>

            {loading ? (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '20px 0', textAlign: 'center' }}>Loading...</div>
            ) : (
              <>
                {/* Confirmed section */}
                <SectionHeader label="Confirmed" count={`${confirmed.length} / ${capacity}`} />
                {confirmed.length === 0 && <EmptyRow />}
                {confirmed.map((s, idx) => (
                  <PlayerRowWrapper key={s.id}>
                    <PlayerRow
                      s={s} pos={idx + 1} saving={saving === s.id}
                      openNote={openNote} noteText={noteText}
                      displayName={displayName(s)}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      onFlag={() => toggleFlag(s)}
                      onRinger={() => toggleRinger(s)}
                      onCaptain={() => toggleCaptain(s)}
                      onNoteOpen={() => openNoteFor(s)}
                      onNoteChange={setNoteText}
                      onNoteSave={() => saveNote(s)}
                      onNoteCancel={cancelNote}
                    />
                  </PlayerRowWrapper>
                ))}

                {/* Ringer divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
                    Ringer List
                  </span>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                </div>

                {/* Ringer section */}
                {ringers.length === 0 && <EmptyRow />}
                {ringers.map((s, idx) => (
                  <PlayerRowWrapper key={s.id}>
                    <PlayerRow
                      s={s} pos={confirmed.length + idx + 1} saving={saving === s.id}
                      openNote={openNote} noteText={noteText}
                      displayName={displayName(s)}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      onFlag={() => toggleFlag(s)}
                      onRinger={() => toggleRinger(s)}
                      onCaptain={() => toggleCaptain(s)}
                      onNoteOpen={() => openNoteFor(s)}
                      onNoteChange={setNoteText}
                      onNoteSave={() => saveNote(s)}
                      onNoteCancel={cancelNote}
                    />
                  </PlayerRowWrapper>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SectionHeader({ label, count }: { label: string; count: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0', marginBottom: 4,
      borderBottom: '0.5px solid var(--border)',
    }}>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto', opacity: 0.6 }}>
        {count}
      </span>
    </div>
  );
}

function PlayerRowWrapper({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function EmptyRow() {
  return <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0', opacity: 0.5 }}>None</div>;
}

interface RowProps {
  s: Signup;
  pos: number;
  saving: boolean;
  openNote: string | null;
  noteText: string;
  displayName: string;
  onDragStart: (e: React.DragEvent, id: string, name: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onFlag: () => void;
  onRinger: () => void;
  onCaptain: () => void;
  onNoteOpen: () => void;
  onNoteChange: (v: string) => void;
  onNoteSave: () => void;
  onNoteCancel: () => void;
}

function PlayerRow({
  s, pos, saving, openNote, noteText, displayName,
  onDragStart, onDragOver, onDragEnd,
  onFlag, onRinger, onCaptain, onNoteOpen, onNoteChange, onNoteSave, onNoteCancel,
}: RowProps) {
  const isNoteOpen = openNote === s.id;
  const hasNote = !!s.admin_note;

  return (
    <>
      <div
        draggable
        onDragStart={e => onDragStart(e, s.id, displayName)}
        onDragOver={e => onDragOver(e, s.id)}
        onDragEnd={onDragEnd}
        style={{
          display: 'grid',
          gridTemplateColumns: '24px 24px 34px 1fr auto',
          alignItems: 'center', gap: 8,
          padding: '7px 8px', borderRadius: 4,
          border: '0.5px solid transparent',
          opacity: s.ringer ? 0.6 : 1,
          cursor: 'default', userSelect: 'none',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Drag handle */}
        <div style={{ fontSize: 16, color: 'var(--text-dim)', cursor: 'grab', textAlign: 'center', lineHeight: 1, opacity: saving ? 0.4 : 1 }}>
          ⠿
        </div>

        {/* Position */}
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {pos}
        </div>

        {/* Class dots */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {(s.class || []).map((cls, i) => (
            <span key={i} style={{
              width: 7, height: 7, borderRadius: '50%',
              background: CLASS_COLORS[cls] || '#888',
              display: 'inline-block', flexShrink: 0,
            }} />
          ))}
        </div>

        {/* Name + badges */}
        <div style={{ fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
          {s.captain && (
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(200,184,122,0.15)', color: '#c8b87a', border: '0.5px solid rgba(200,184,122,0.4)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
              ♛ captain
            </span>
          )}
          {s.ringer && (
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#5a6a9c22', color: '#5a6a9c', border: '0.5px solid #5a6a9c44', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
              ringer
            </span>
          )}
          {s.flagged && (
            <span style={{ fontSize: 10, background: '#c0392b18', color: '#c0392b', border: '0.5px solid #c0392b44', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
              ⚑ flagged
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <IconBtn
            onClick={onCaptain}
            active={s.captain}
            activeColor="#c8b87a"
            activeTextColor="#1a1a14"
            title={s.captain ? 'Remove captain' : 'Assign as captain'}
            icon="♛"
          />
          <IconBtn
            onClick={onNoteOpen}
            active={hasNote}
            activeColor="#c8b87a"
            activeTextColor="#1a1a14"
            title={hasNote ? 'Edit note' : 'Add note'}
            icon="✎"
          />
          <IconBtn
            onClick={onFlag}
            active={s.flagged}
            activeColor="#c0392b"
            activeTextColor="#fff"
            title={s.flagged ? 'Unflag' : 'Flag player'}
            icon={s.flagged ? '⚑' : '⚐'}
          />
          <IconBtn
            onClick={onRinger}
            active={s.ringer}
            activeColor="#5a6a9c"
            activeTextColor="#fff"
            title={s.ringer ? 'Remove ringer' : 'Mark as ringer'}
            icon="◉"
          />
        </div>
      </div>

      {/* Inline note editor */}
      {isNoteOpen && (
        <div style={{ padding: '4px 8px 8px 64px' }}>
          <textarea
            autoFocus
            value={noteText}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="Admin note — invisible to players"
            style={{
              width: '100%', fontSize: 12, fontFamily: 'var(--font-body)',
              background: 'var(--surface2)', border: '0.5px solid var(--border-strong)',
              borderRadius: 4, padding: '6px 8px', color: 'var(--text)',
              resize: 'none', height: 52, display: 'block',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 5, justifyContent: 'flex-end' }}>
            <button onClick={onNoteCancel} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 3,
              border: '0.5px solid var(--border)', background: 'transparent',
              color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>Cancel</button>
            <button onClick={onNoteSave} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 3,
              background: 'var(--khaki)', color: '#1a1a14',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500,
            }}>Save</button>
          </div>
        </div>
      )}
    </>
  );
}

function IconBtn({
  onClick, active, activeColor, activeTextColor, title, icon,
}: {
  onClick: () => void;
  active: boolean;
  activeColor: string;
  activeTextColor: string;
  title: string;
  icon: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={title}
        style={{
          width: 28, height: 28, borderRadius: 4,
          border: `0.5px solid ${active ? activeColor : 'var(--border)'}`,
          background: active ? activeColor : 'transparent',
          color: active ? activeTextColor : 'var(--text-dim)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14, lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        {icon}
      </button>
      {hovered && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '0.5px solid var(--border-strong)',
          borderRadius: 4, padding: '4px 8px', whiteSpace: 'nowrap',
          fontSize: 11, color: 'var(--text)', pointerEvents: 'none',
          zIndex: 50, fontFamily: 'var(--font-body)',
        }}>
          {title}
        </div>
      )}
    </div>
  );
}
