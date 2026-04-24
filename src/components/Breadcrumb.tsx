import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href: string
}

export function Breadcrumb({ items }: { items?: BreadcrumbItem[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Link
        href="/dashboard"
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 20,
          letterSpacing: 3,
          color: 'var(--khaki)',
          textDecoration: 'none',
        }}
      >
        DRAFT MAN 5.0
      </Link>
      {items?.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(200,184,122,0.4)', fontSize: 14 }}>›</span>
          <Link
            href={item.href}
            style={{
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              color: 'var(--text-dim)',
              textDecoration: 'none',
            }}
          >
            {item.label}
          </Link>
        </span>
      ))}
    </div>
  )
}
