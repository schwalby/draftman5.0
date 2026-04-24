'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'olive' | 'slate'>('olive')

  useEffect(() => {
    const saved = localStorage.getItem('draftman-theme') as 'olive' | 'slate' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'slate' ? 'slate' : '')
    }
  }, [])

  const apply = (next: 'olive' | 'slate') => {
    setTheme(next)
    localStorage.setItem('draftman-theme', next)
    document.documentElement.setAttribute('data-theme', next === 'slate' ? 'slate' : '')
  }

  const btn = (label: string, value: 'olive' | 'slate') => ({
    onClick: () => apply(value),
    style: {
      padding: '4px 12px',
      fontSize: 10,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      fontFamily: 'var(--font-body)',
      cursor: 'pointer',
      border: 'none',
      background: theme === value ? 'var(--khaki)' : 'transparent',
      color: theme === value ? '#1a1a14' : 'var(--text-dim)',
    }
  })

  return (
    <div style={{
      display: 'inline-flex',
      border: '0.5px solid var(--border-strong)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <button {...btn('Light', 'olive')}>Light</button>
      <div style={{ width: '0.5px', background: 'var(--border-strong)' }} />
      <button {...btn('Dark', 'slate')}>Dark</button>
    </div>
  )
}
