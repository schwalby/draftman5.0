'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/Topbar';

const MAPS = [
  'dod_harrington','dod_halle','dod_anzio','dod_thunder2','dod_railyard_s9c',
  'dod_solitude2','dod_anjou_a5','dod_lennon5_b1','dod_armory_b6','dod_railroad2_s9a',
  'dod_saints2_b2','dod_anjou_a3','dod_saints_b1','dod_donner','dod_railroad',
  'dod_aleutian','dod_avalanche','dod_emmanuel','dod_kalt','dod_lennon_b3',
  'dod_merderet','dod_northbound','dod_muhle_b2','dod_lindbergh_b1','dod_cal_sherman2',
  'dod_lennon2_b1','dod_lennon_b2',
];

const FORMAT_DEFAULTS: Record<string, Record<string, number>> = {
  '6v6':   { rifle: 2, third: 1, heavy: 2, sniper: 1 },
  '8v8':   { rifle: 2, third: 2, heavy: 2, sniper: 2 },
  '12v12': { rifle: 3, third: 3, heavy: 3, sniper: 3 },
  '16v16': { rifle: 4, third: 4, heavy: 4, sniper: 4 },
};

interface FormState {
  name: string;
  type: string;
  format: string;
  halfLength: number;
  slots: { rifle: number; third: number; heavy: number; sniper: number };
  draftDate: string;       // date only — YYYY-MM-DD — maps to starts_at
  maps: string[];
  signupOpens: string;     // datetime-local string
  checkinTime: string;     // time only — HH:MM
  notes: string;
}

const initialState: FormState = {
  name: '',
  type: 'draft',
  format: '6v6',
  halfLength: 20,
  slots: { rifle: 2, third: 1, heavy: 2, sniper: 1 },
  draftDate: '',
  maps: [],
  signupOpens: '',
  checkinTime: '',
  notes: '',
};

// Combine draftDate + checkinTime into a datetime string for DB
function buildCheckinAt(date: string, time: string): string | null {
  if (!date || !time) return null;
  return `${date}T${time}:00`;
}

// Format a date string for display
function fmtDateOnly(d: string): string {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00'); // noon to avoid TZ shift
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function NewEventPage() {
  const { status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialState);
  const [eventId, setEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/');
  }, [status, router]);

  const totalCapacity = Object.values(form.slots).reduce((a, b) => a + b, 0);

  const buildPayload = (f: FormState) => ({
    name: f.name || 'Untitled Draft',
    type: f.type,
    format: f.format,
    half_length: f.halfLength,
    slots_rifle: f.slots.rifle,
    slots_third: f.slots.third,
    slots_heavy: f.slots.heavy,
    slots_sniper: f.slots.sniper,
    capacity: Object.values(f.slots).reduce((a, b) => a + b, 0),
    maps: f.maps,
    starts_at: f.draftDate ? `${f.draftDate}T00:00:00` : null,
    signup_opens_at: f.signupOpens || null,
    checkin_opens_at: buildCheckinAt(f.draftDate, f.checkinTime),
    notes: f.notes || null,
    status: 'draft',
  });

  const saveToDb = useCallback(async (f: FormState, id: string | null): Promise<string | null> => {
    setSaving(true);
    try {
      if (!id) {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(f)),
        });
        if (!res.ok) return null;
        const data = await res.json();
        setEventId(data.id);
        setSaving(false);
        return data.id;
      } else {
        await fetch(`/api/events/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(f)),
        });
        setSaving(false);
        return id;
      }
    } catch {
      setSaving(false);
      return id;
    }
  }, []);

  const debouncedSave = useCallback((f: FormState, id: string | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveToDb(f, id), 1200);
  }, [saveToDb]);

  const updateForm = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    debouncedSave(next, eventId);
  };

  const goTo = async (n: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = await saveToDb(form, eventId);
    if (id && !eventId) setEventId(id);
    setStep(n);
  };

  const handlePublish = async () => {
    setPublishing(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = eventId || await saveToDb(form, null);
    if (!id) { setPublishing(false); return; }
    await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'scheduled' }),
    });
    router.push('/dashboard');
  };

  const toggleMap = (m: string) => {
    const next = form.maps.includes(m)
      ? form.maps.filter(x => x !== m)
      : [...form.maps, m];
    updateForm({ maps: next });
  };

  const adjustSlot = (key: keyof typeof form.slots, dir: number) => {
    const next = { ...form.slots, [key]: Math.max(0, form.slots[key] + dir) };
    updateForm({ slots: next });
  };

  const setFormat = (fmt: string) => {
    updateForm({ format: fmt, slots: { ...FORMAT_DEFAULTS[fmt] } });
  };

  const fmtDatetime = (v: string) =>
    v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (status === 'loading') return null;

  return (
    <>
      <Topbar items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'New Event', href: '/events/new' }]} />
      <div style={{ minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Step tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 32 }}>
          {['Basics', 'Details', 'Review'].map((label, i) => {
            const n = i + 1;
            const isActive = step === n;
            const isDone = step > n;
            return (
              <div
                key={n}
                style={{
                  flex: 1, padding: '10px 0', textAlign: 'center',
                  fontSize: 11, letterSpacing: '0.1em', fontFamily: 'var(--font-body)',
                  cursor: isDone ? 'pointer' : 'default',
                  color: isActive ? 'var(--khaki)' : isDone ? 'var(--green-light)' : 'var(--text-dim)',
                  borderBottom: isActive ? '2px solid var(--khaki)' : '2px solid transparent',
                  marginBottom: -1, transition: 'color 0.15s',
                }}
                onClick={() => isDone ? goTo(n) : undefined}
              >
                {n}. {label.toUpperCase()}
              </div>
            );
          })}
        </div>

        {/* STEP 1 — BASICS */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, letterSpacing: '0.08em', color: 'var(--khaki)', marginBottom: 28 }}>
              BASICS
            </h2>

            <Field label="Event Name">
              <input
                style={inputStyle}
                type="text"
                placeholder="Friday Night Draft"
                value={form.name}
                onChange={e => updateForm({ name: e.target.value })}
              />
            </Field>

            <Field label="Draft Date">
              <input
                style={{ ...inputStyle, colorScheme: 'dark' } as React.CSSProperties}
                type="date"
                value={form.draftDate}
                onChange={e => updateForm({ draftDate: e.target.value })}
              />
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 5, letterSpacing: '0.06em' }}>
                Used to pre-fill the check-in date on the next step.
              </div>
            </Field>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0 20px' }} />

            <Field label="Type">
              <PillGroup
                options={[{ val: 'draft', label: 'Draft' }, { val: 'community', label: 'Community Event' }]}
                value={form.type}
                onChange={val => updateForm({ type: val })}
              />
            </Field>

            <Field label="Format">
              <PillGroup
                options={['6v6','8v8','12v12','16v16'].map(v => ({ val: v, label: v }))}
                value={form.format}
                onChange={val => setFormat(val)}
              />
            </Field>

            <Field label="Half Length">
              <PillGroup
                options={[{ val: '15', label: '15 min' }, { val: '20', label: '20 min' }]}
                value={String(form.halfLength)}
                onChange={val => updateForm({ halfLength: parseInt(val) })}
              />
            </Field>

            <Field label="Class Slots">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['rifle','third','heavy','sniper'] as const).map(cls => (
                  <div key={cls} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: CLASS_COLORS[cls], fontFamily: 'var(--font-body)' }}>
                      {cls === 'third' ? 'Third' : cls.charAt(0).toUpperCase() + cls.slice(1)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <SlotBtn onClick={() => adjustSlot(cls, -1)}>-</SlotBtn>
                      <span style={{ fontSize: 14, color: 'var(--text)', minWidth: 16, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{form.slots[cls]}</span>
                      <SlotBtn onClick={() => adjustSlot(cls, 1)}>+</SlotBtn>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border-strong)', padding: '10px 14px', marginTop: 4 }}>
                <span style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>Total Capacity</span>
                <span style={{ fontSize: 20, color: 'var(--khaki)', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}>{totalCapacity}</span>
              </div>
            </Field>

            <BtnRow>
              <Btn onClick={() => router.push('/dashboard')}>Cancel</Btn>
              <Btn primary onClick={() => goTo(2)}>Next: Details →</Btn>
            </BtnRow>
          </div>
        )}

        {/* STEP 2 — DETAILS */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, letterSpacing: '0.08em', color: 'var(--khaki)', marginBottom: 28 }}>
              DETAILS
            </h2>

            <Field label="Map Pool">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {MAPS.map(m => (
                  <div
                    key={m}
                    onClick={() => toggleMap(m)}
                    style={{
                      padding: '5px 11px', fontSize: 11, letterSpacing: '0.06em',
                      border: form.maps.includes(m) ? '1px solid var(--khaki)' : '1px solid var(--border)',
                      background: form.maps.includes(m) ? 'rgba(200,184,122,0.1)' : 'var(--surface)',
                      color: form.maps.includes(m) ? 'var(--khaki)' : 'var(--text-dim)',
                      cursor: 'pointer', borderRadius: 3, fontFamily: 'var(--font-body)',
                      transition: 'all 0.12s',
                    }}
                  >
                    {m}
                  </div>
                ))}
              </div>
            </Field>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

            <Field label="Sign-up Opens">
              <input
                style={{ ...inputStyle, colorScheme: 'dark' } as React.CSSProperties}
                type="datetime-local"
                value={form.signupOpens}
                onChange={e => updateForm({ signupOpens: e.target.value })}
              />
            </Field>

            <Field label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Check-in Opens
                {form.draftDate && (
                  <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--khaki)', border: '1px solid rgba(200,184,122,0.3)', padding: '1px 6px', borderRadius: 2 }}>
                    DATE FROM BASICS
                  </span>
                )}
              </span>
            }>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: form.draftDate ? 'var(--text-dim)' : 'var(--text-dim)',
                  padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-body)',
                }}>
                  {form.draftDate ? fmtDateOnly(form.draftDate) : <span style={{ opacity: 0.4 }}>No draft date set</span>}
                </div>
                <input
                  style={{ ...inputStyle, colorScheme: 'dark', borderColor: form.draftDate ? 'var(--border-strong)' : 'var(--border)' } as React.CSSProperties}
                  type="time"
                  value={form.checkinTime}
                  onChange={e => updateForm({ checkinTime: e.target.value })}
                  disabled={!form.draftDate}
                />
              </div>
              {!form.draftDate && (
                <div style={{ fontSize: 10, color: 'var(--rust)', marginTop: 5, letterSpacing: '0.06em' }}>
                  Set a Draft Date in Basics to enable check-in time.
                </div>
              )}
            </Field>

            <Field label="Notes (optional)">
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: 80 } as React.CSSProperties}
                placeholder="Any additional info for players..."
                value={form.notes}
                onChange={e => updateForm({ notes: e.target.value })}
              />
            </Field>

            <BtnRow>
              <Btn onClick={() => goTo(1)}>← Back</Btn>
              <Btn primary onClick={() => goTo(3)}>Next: Review →</Btn>
            </BtnRow>
          </div>
        )}

        {/* STEP 3 — REVIEW */}
        {step === 3 && (
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, letterSpacing: '0.08em', color: 'var(--khaki)', marginBottom: 28 }}>
              REVIEW
            </h2>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', padding: 20 }}>
              <div style={{ display: 'inline-block', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', border: '1px solid var(--border-strong)', color: 'var(--khaki)', marginBottom: 14, borderRadius: 2, fontFamily: 'var(--font-body)' }}>
                {form.type === 'draft' ? 'Draft Event' : 'Community Event'}
              </div>
              <div style={{ fontSize: 22, letterSpacing: '0.06em', color: 'var(--text)', marginBottom: 16, textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                {form.name || 'Unnamed Event'}
              </div>

              {[
                { key: 'Type',           val: form.type === 'draft' ? 'Draft' : 'Community Event', color: 'var(--khaki)' },
                { key: 'Format',         val: form.format,                                          color: '#8a9acc' },
                { key: 'Half Length',    val: `${form.halfLength} min`,                             color: '#4abcaa' },
                { key: 'Draft Date',     val: form.draftDate ? fmtDateOnly(form.draftDate) : '—',   color: '#c8b87a' },
                { key: 'Maps Selected',  val: form.maps.length ? `${form.maps.length} maps` : 'None', color: '#7aba7a' },
                { key: 'Sign-up Opens',  val: fmtDatetime(form.signupOpens),                        color: '#d97060' },
                { key: 'Check-in Opens', val: form.draftDate && form.checkinTime ? `${fmtDateOnly(form.draftDate)} · ${form.checkinTime}` : '—', color: '#8a9acc' },
              ].map(row => (
                <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>{row.key}</span>
                  <span style={{ fontSize: 13, color: row.color, fontFamily: 'var(--font-body)' }}>{row.val}</span>
                </div>
              ))}
            </div>

            {saving && (
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, fontFamily: 'var(--font-body)', letterSpacing: '0.08em' }}>Saving draft...</p>
            )}

            <BtnRow>
              <Btn onClick={() => goTo(2)}>← Edit</Btn>
              <Btn publish onClick={handlePublish} disabled={publishing}>
                {publishing ? 'Publishing...' : 'Publish Event'}
              </Btn>
            </BtnRow>
          </div>
        )}

      </div>
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  rifle: '#c8a050', third: '#4a9c6a', heavy: '#9c5a4a', sniper: '#5a6a9c',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  outline: 'none',
  borderRadius: 0,
};

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-dim)', marginBottom: 8, display: 'block', textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PillGroup({ options, value, onChange }: { options: { val: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => (
        <div
          key={o.val}
          onClick={() => onChange(o.val)}
          style={{
            padding: '7px 14px', fontSize: 12, letterSpacing: '0.08em',
            border: value === o.val ? '1px solid var(--khaki)' : '1px solid var(--border)',
            background: value === o.val ? 'rgba(200,184,122,0.12)' : 'var(--surface)',
            color: value === o.val ? 'var(--khaki)' : 'var(--text-dim)',
            cursor: 'pointer', borderRadius: 3, fontFamily: 'var(--font-body)',
            transition: 'all 0.12s',
          }}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}

function SlotBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 22, height: 22, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--khaki)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, fontFamily: 'monospace' }}
    >
      {children}
    </button>
  );
}

function BtnRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
      {children}
    </div>
  );
}

function Btn({ onClick, children, primary, publish, disabled }: { onClick?: () => void; children: React.ReactNode; primary?: boolean; publish?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 22px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
        border: publish ? '1px solid var(--green-light)' : '1px solid var(--border)',
        background: publish ? 'var(--green-light)' : primary ? 'rgba(200,184,122,0.1)' : 'transparent',
        color: publish ? '#1a1a14' : primary ? 'var(--khaki)' : 'var(--text-dim)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-body)', borderRadius: 2,
        fontWeight: publish ? 700 : 400,
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  );
}
