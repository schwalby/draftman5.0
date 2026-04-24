'use client'

import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    }}>
      <div style={{
        fontFamily: 'Bebas Neue, sans-serif',
        fontSize: 28,
        color: 'var(--rust)',
        letterSpacing: 2,
      }}>
        AUTH ERROR
      </div>
      <div style={{
        fontSize: 13,
        fontFamily: 'IBM Plex Mono, monospace',
        color: 'var(--text-dim)',
      }}>
        Something went wrong during sign in.
      </div>
      <Link href="/">
        <button style={{
          marginTop: 8,
          fontSize: 12,
          fontFamily: 'IBM Plex Mono, monospace',
          color: 'var(--khaki)',
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '6px 16px',
          cursor: 'pointer',
        }}>
          Back to Home
        </button>
      </Link>
    </div>
  )
}
