'use client'

import { useEffect, useState } from 'react'
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

function RuleItem({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 9, alignItems: 'flex-start' }}>
      <span style={{
        width: 4, height: 4, borderRadius: '50%',
        background: 'rgba(200,184,122,0.4)',
        flexShrink: 0, marginTop: 7, display: 'inline-block',
      }} />
      <span
        style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.65, fontFamily: 'var(--font-body)' }}
        dangerouslySetInnerHTML={{
          __html: text
            .replace(/<b>/g, '<strong style="color:var(--text);font-weight:500">')
            .replace(/<\/b>/g, '</strong>')
        }}
      />
    </div>
  )
}

export default function RulesPage() {
  const [sections, setSections] = useState<RulesSection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/rules')
      .then(r => r.json())
      .then(data => { setSections(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <>
      <Topbar />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 40, color: 'var(--khaki)', marginBottom: 6 }}>
          Rules &amp; Format
        </h1>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 40, fontFamily: 'var(--font-body)' }}>
          Day of Defeat 1.3 &nbsp;·&nbsp; Draft Events
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
        ) : sections.map(section => (
          <div key={section.id} style={{ marginBottom: 36 }}>
            <div style={{
              fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--khaki)',
              borderBottom: '0.5px solid var(--border)',
              paddingBottom: 8, marginBottom: 14, fontFamily: 'var(--font-body)',
            }}>
              {section.title}
            </div>
            {(section.rules_items || [])
              .sort((a, b) => a.position - b.position)
              .map(item => (
                <RuleItem key={item.id} text={item.content} />
              ))
            }
          </div>
        ))}
      </div>
    </>
  )
}
