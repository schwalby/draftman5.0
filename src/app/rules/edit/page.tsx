'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Strike from '@tiptap/extension-strike'
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

function RuleEditor({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, blockquote: false, codeBlock: false, horizontalRule: false }),
      Underline,
      Strike,
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 36px; font-family: var(--font-body); font-size: 12px; color: var(--text); line-height: 1.6; padding: 7px 9px;',
      },
    },
  })

  if (!editor) return null

  const btnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(200,184,122,0.2)' : 'transparent',
    border: `1px solid ${active ? 'var(--khaki)' : 'var(--border)'}`,
    color: active ? 'var(--khaki)' : 'var(--text-dim)',
    borderRadius: 2, padding: '2px 7px', cursor: 'pointer',
    fontFamily: 'var(--font-body)', fontSize: 11, lineHeight: 1.4,
  })

  return (
    <div style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 3, padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexWrap: 'wrap' }}>
        <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }} style={btnStyle(editor.isActive('bold'))}><strong>B</strong></button>
        <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }} style={btnStyle(editor.isActive('italic'))}><em>I</em></button>
        <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }} style={btnStyle(editor.isActive('underline'))}><u>U</u></button>
        <button onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }} style={btnStyle(editor.isActive('strike'))}><s>S</s></button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
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

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  function updateSectionTitle(idx: number, title: string) {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, title } : s))
  }

  function updateItemContent(sIdx: number, iIdx: number, content: string) {
    setSections(prev => prev.map((s, i) => i === sIdx ? {
      ...s, rules_items: s.rules_items.map((item, j) => j === iIdx ? { ...item, content } : item)
    } : s))
  }

  async function addSection() {
    const res = await fetch('/api/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New Section' }) })
    if (res.ok) { const data = await res.json(); setSections(prev => [...prev, { ...data, rules_items: [] }]) }
  }

  async function deleteSection(sectionId: string) {
    if (!confirm('Delete this section and all its rules?')) return
    await fetch(`/api/rules/${sectionId}`, { method: 'DELETE' })
    setSections(prev => prev.filter(s => s.id !== sectionId))
    showToast('Section deleted')
  }

  async function addItem(sectionId: string, sIdx: number) {
    const res = await fetch(`/api/rules/${sectionId}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '' }) })
    if (res.ok) { const data = await res.json(); setSections(prev => prev.map((s, i) => i === sIdx ? { ...s, rules_items: [...s.rules_items, data] } : s)) }
  }

  async function deleteItem(sectionId: string, itemId: string, sIdx: number) {
    await fetch(`/api/rules/${sectionId}/items/${itemId}`, { method: 'DELETE' })
    setSections(prev => prev.map((s, i) => i === sIdx ? { ...s, rules_items: s.rules_items.filter(item => item.id !== itemId) } : s))
  }

  async function saveAll() {
    setSaving(true)
    await Promise.all(sections.map(async (section, sIdx) => {
      await fetch(`/api/rules/${section.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: section.title, position: sIdx }) })
      await Promise.all(section.rules_items.map(async (item, iIdx) => {
        await fetch(`/api/rules/${section.id}/items/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: item.content, position: iIdx }) })
      }))
    }))
    setSaving(false)
    showToast('Changes saved')
  }

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

  function onItemDragStart(sIdx: number, iIdx: number) { dragItem.current = { sectionIdx: sIdx, itemIdx: iIdx } }
  function onItemDragOver(e: React.DragEvent, sIdx: number, iIdx: number) {
    e.preventDefault()
    if (!dragItem.current || dragItem.current.sectionIdx !== sIdx || dragItem.current.itemIdx === iIdx) return
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

  function renderSections() {
    const rows: JSX.Element[] = []
    let i = 0
    while (i < sections.length) {
      const remaining = sections.length - i
      if (remaining < 3) {
        for (let j = i; j < sections.length; j++) {
          rows.push(<div key={sections[j].id} style={{ width: '100%' }}>{renderCard(sections[j], j)}</div>)
        }
        break
      } else {
        const group = sections.slice(i, i + 3)
        rows.push(
          <div key={`row-${i}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {group.map((s, gi) => renderCard(s, i + gi))}
          </div>
        )
        i += 3
      }
    }
    return rows
  }

  function renderCard(section: RulesSection, idx: number) {
    return (
      <div key={section.id} draggable onDragStart={() => onSectionDragStart(idx)} onDragOver={e => onSectionDragOver(e, idx)} onDragEnd={onSectionDragEnd}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-dim)', cursor: 'grab', fontSize: 14, flexShrink: 0, userSelect: 'none' }}>⠿</span>
          <input value={section.title} onChange={e => updateSectionTitle(idx, e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text)', letterSpacing: '0.08em', textTransform: 'uppercase' }} />
          <button onClick={() => deleteSection(section.id)}
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 3, border: '1px solid var(--rust)', color: 'var(--rust)', background: 'rgba(192,57,43,0.08)', cursor: 'pointer', flexShrink: 0 }}>Delete</button>
        </div>
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {section.rules_items.sort((a, b) => a.position - b.position).map((item, iIdx) => (
            <div key={item.id} draggable onDragStart={() => onItemDragStart(idx, iIdx)} onDragOver={e => onItemDragOver(e, idx, iIdx)} onDragEnd={onItemDragEnd}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ color: 'var(--text-dim)', cursor: 'grab', fontSize: 12, marginTop: 10, flexShrink: 0, userSelect: 'none' }}>⠿</span>
              <RuleEditor content={item.content} onChange={html => updateItemContent(idx, iIdx, html)} />
              <button onClick={() => deleteItem(section.id, item.id, idx)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14, padding: '8px 4px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => addItem(section.id, idx)}
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', background: 'transparent', cursor: 'pointer' }}>+ Add Rule</button>
        </div>
      </div>
    )
  }

  if (status === 'loading' || loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
  }

  return (
    <>
      <Topbar breadcrumbs={[{ label: 'Rules', href: '/rules' }, { label: 'Edit' }]} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px 100px', fontFamily: 'var(--font-body)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 28, letterSpacing: '0.04em', color: 'var(--text)', lineHeight: 1 }}>Edit Rules</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>Drag to reorder. Bold, italic, underline, strikethrough supported.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/rules" style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3, border: '1px solid var(--border)', color: 'var(--text-dim)', textDecoration: 'none' }}>View Rules</a>
            <button onClick={saveAll} disabled={saving}
              style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 16px', borderRadius: 3, cursor: 'pointer', border: '1px solid var(--khaki)', color: 'var(--khaki)', background: 'rgba(200,184,122,0.08)', opacity: saving ? 0.6 : 1 }}
            >{saving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>{renderSections()}</div>
        <div onClick={addSection} style={{ background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 4, padding: 16, textAlign: 'center', cursor: 'pointer' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>+ Add New Section</span>
        </div>
      </div>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--green-light)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12, padding: '10px 16px', borderRadius: 3, zIndex: 999 }}>{toast}</div>
      )}
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .ProseMirror p { margin: 0; }
        .ProseMirror:focus { outline: none; }
        .ProseMirror strong { color: var(--text); font-weight: 500; }
      `}</style>
    </>
  )
}
