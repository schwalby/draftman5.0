'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/Topbar'
import { Spinner } from '@/components/Spinner'

interface RulesItem {
  id: string
  content: string
  position: number
}

interface RulesSection {
  id: string
  title: string
  position: number
  rules_items: RulesItem[]
}

export default function RulesEditPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [sections, setSections] = useState<RulesSection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const dragSection = useRef<number | null>(null)
  const dragItem = useRef<{ sectionIdx: number; itemIdx: number } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
    if (status === 'authenticated' && !session?.user?.isOrganizer) router.replace('/rules')
  }, [status, session, router])

  useEffect(() => {
    if (status === 'authenticated') fetchSections()
  }, [status])

  async function fetchSections() {
    setLoading(true)
    const res = await fetch('/api/rules')
    if (res.ok) {
      const data = await res.json()
      setSections(data.sort((a: RulesSection, b: RulesSection) => a.position - b.position))
    }
    setLoading(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // ── Section title change (local only) ────────────────────────────
  function updateSectionTitle(idx: number, title: string) {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, title } : s))
  }

  // ── Item content change (local only) ─────────────────────────────
  function updateItemContent(sIdx: number, iIdx: number, content: string) {
    setSections(prev => prev.map((s, i) => i === sIdx ? {
      ...s,
      rules_items: s.rules_items.map((item, j) => j === iIdx ? { ...item, content } : item)
    } : s))
  }

  // ── Add section ───────────────────────────────────────────────────
  async function addSection() {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Section' }),
    })
    if (res.ok) {
      const data = await res.json()
      setSections(prev => [...prev, { ...data, rules_items: [] }])
    }
  }

  // ── Delete section ────────────────────────────────────────────────
  async function deleteSection(sectionId: string) {
    if (!confirm('Delete this section and all its rules?')) return
    await fetch(`/api/rules/${sectionId}`, { method: 'DELETE' })
    setSections(prev => prev.filter(s => s.id !== sectionId))
    showToast('Section deleted')
  }

  // ── Add item ──────────────────────────────────────────────────────
  async function addItem(sectionId: string, sIdx: number) {
    const res = await fetch(`/api/rules/${sectionId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '' }),
    })
    if (res.ok) {
      const data = await res.json()
      setSections(prev => prev.map((s, i) => i === sIdx ? {
        ...s, rules_items: [...s.rules_items, data]
      } : s))
    }
  }

  // ── Delete item ───────────────────────────────────────────────────
  async function deleteItem(sectionId: string, itemId: string, sIdx: number) {
    await fetch(`/api/rules/${sectionId}/items/${itemId}`, { method: 'DELETE' })
    setSections(prev => prev.map((s, i) => i === sIdx ? {
      ...s, rules_items: s.rules_items.filter(item => item.id !== itemId)
    } : s))
  }

  // ── Save all ──────────────────────────────────────────────────────
  async function saveAll() {
    setSaving(true)
    await Promise.all(sections.map(async (section, sIdx) => {
      await fetch(`/api/rules/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: section.title, position: sIdx }),
      })
      await Promise.all(section.rules_items.map(async (item, iIdx) => {
        await fetch(`/api/rules/${section.id}/items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: item.content, position: iIdx }),
        })
      }))
    }))
    setSaving(false)
    showToast('Changes saved')
  }

  // ── Section drag handlers ─────────────────────────────────────────
  function onSectionDragStart(idx: number) { dragSection.current = idx }
  function onSectionDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragSection.current === null || dragSection.current === idx) return
    const reordered = [...sections]
    const [moved] = reordered.splice(dragSection.current, 1)
    reordered.splice(idx, 0, moved)
    dragSection.current = idx
    setSections(reordered)
  }
  function onSectionDragEnd() { dragSection.current = null }

  // ── Item drag handlers ────────────────────────────────────────────
  function onItemDragStart(sIdx: number, iIdx: number) { dragItem.current = { sectionIdx: sIdx, itemIdx: iIdx } }
  function onItemDragOver(e: React.DragEvent, sIdx: number, iIdx: number) {
    e.preventDefault()
    if (!dragItem.current) return
    if (dragItem.current.sectionIdx !== sIdx || dragItem.current.itemIdx === iIdx) return
    setSections(prev => prev.map((s, i) => {
      if (i !== sIdx) return s
      const items = [...s.rules_items]
      const [moved] = items.splice(dragItem.current!.itemIdx, 1)
      items.splice(iIdx, 0, moved)
      dragItem.current = { sectionIdx: sIdx, itemIdx: iIdx }
      return { ...s, rules_items: items }
    }))
  }
  function onItemDragEnd() { dragItem.current = null }

  // ── Render sections in collapsing grid ────────────────────────────
  // Groups of 3 sections collapse into a row, remainder stacks full-width
  function renderSections() {
    const rows: JSX.Element[] = []
    let i = 0
    while (i < sections.length) {
      const remaining = sections.length - i
      const isLastGroup = remaining < 3
      if (isLastGroup) {
        // Render remaining sections full width
        for (let j = i; j < sections.length; j++) {
          rows.push(
            <div key={sections[j].id} style={{ width: '100%' }}>
              {renderSectionCard(sections[j], j)}
            </div>
          )
        }
        break
      } else {
        // Render group of 3 in a row
        const group = sections.slice(i, i + 3)
        rows.push(
          <div key={`row-${i}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {group.map((s, gi) => renderSectionCard(s, i + gi))}
          </div>
        )
        i += 3
      }
    }
    return rows
  }

  function renderSectionCard(section: RulesSection, idx: number) {
    return (
      <div
        key={section.id}
        draggable
        onDragStart={() => onSectionDragStart(idx)}
        onDragOver={e => onSectionDragOver(e, idx)}
        onDragEnd={onSectionDragEnd}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 4, overflow: 'hidden', cursor: 'default',
        }}
      >
        {/* Section header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', background: 'var(--surface2)',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ color: 'var(--text-dim)', cursor: 'grab', fontSize: 14, flexShrink: 0, userSelect: 'none' }}>⠿</span>
          <input
            value={section.title}
            onChange={e => updateSectionTitle(idx, e.target.value)}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}
          />
          <button
            onClick={() => deleteSection(section.id)}
            style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9,
              letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px',
              borderRadius: 3, border: '1px solid var(--rust)', color: 'var(--rust)',
              background: 'rgba(192,57,43,0.08)', cursor: 'pointer', flexShrink: 0,
            }}
          >Delete</button>
        </div>

        {/* Items */}
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {section.rules_items
            .sort((a, b) => a.position - b.position)
            .map((item, iIdx) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => onItemDragStart(idx, iIdx)}
                onDragOver={e => onItemDragOver(e, idx, iIdx)}
                onDragEnd={onItemDragEnd}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}
              >
                <span style={{ color: 'var(--text-dim)', cursor: 'grab', fontSize: 12, marginTop: 8, flexShrink: 0, userSelect: 'none' }}>⠿</span>
                <textarea
                  value={item.content}
                  onChange={e => updateItemContent(idx, iIdx, e.target.value)}
                  rows={2}
                  style={{
                    flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 3, padding: '7px 9px', fontFamily: 'var(--font-body)',
                    fontSize: 12, color: 'var(--text)', outline: 'none', resize: 'none',
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={() => deleteItem(section.id, item.id, idx)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: '6px 4px', flexShrink: 0 }}
                >✕</button>
              </div>
            ))}
        </div>

        {/* Add rule */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => addItem(section.id, idx)}
            style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9,
              letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px',
              borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)',
              background: 'transparent', cursor: 'pointer',
            }}
          >+ Add Rule</button>
        </div>
      </div>
    )
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
      <Topbar items={[{ label: 'Rules & Format', href: '/rules' }, { label: 'Edit', href: '/rules/edit' }]} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px 100px', fontFamily: 'var(--font-body)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 28, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>
              Edit Rules
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
              Drag to reorder sections and rules. Save when done.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/rules" style={{
              fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em',
              textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3,
              border: '1px solid var(--border)', color: 'var(--text-dim)', textDecoration: 'none',
            }}>View Rules</a>
            <button
              onClick={saveAll}
              disabled={saving}
              style={{
                fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em',
                textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3, cursor: 'pointer',
                border: '1px solid var(--khaki)', color: 'var(--khaki)',
                background: 'rgba(200,184,122,0.08)', opacity: saving ? 0.6 : 1,
              }}
            >{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          {renderSections()}
        </div>

        {/* Add section */}
        <div
          onClick={addSection}
          style={{
            background: 'var(--surface)', border: '1px dashed var(--border-strong)',
            borderRadius: 4, padding: 16, textAlign: 'center', cursor: 'pointer',
          }}
        >
          <span style={{
            fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 10,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)',
          }}>+ Add New Section</span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--surface)', border: '1px solid var(--border-strong)',
          borderLeft: '3px solid var(--green-light)', color: 'var(--text)',
          fontFamily: 'var(--font-body)', fontSize: 12, padding: '10px 16px',
          borderRadius: 3, zIndex: 999, animation: 'slideUp 0.2s ease',
        }}>{toast}</div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        textarea:focus { border-color: var(--border-strong) !important; }
      `}</style>
    </>
  )
}
