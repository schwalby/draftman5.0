'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TopbarProps {
  breadcrumbs?: BreadcrumbItem[];
}

export function Topbar({ breadcrumbs }: TopbarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();

  const isOrganizer = session?.user?.isOrganizer;
  const isSuperUser = (session?.user as any)?.isSuperUser;
  const isAdmin = isOrganizer || isSuperUser;

  const avatar = (session?.user as any)?.discordAvatar;
  const discordId = (session?.user as any)?.discordId;
  const username = (session?.user as any)?.discordUsername || session?.user?.name || '?';
  const initial = username.charAt(0).toUpperCase();

  const avatarUrl = avatar && discordId
    ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`
    : null;

  // Determine which top-level section is "active" based on pathname
  function getActiveSection(): string {
    if (pathname === '/dashboard' || pathname === '/events/new' || pathname.includes('/edit')) return 'dashboard';
    if (pathname.startsWith('/portal')) return 'portal';
    if (pathname.startsWith('/events')) return 'events';
    if (pathname === '/rules') return 'rules';
    if (pathname === '/settings') return 'settings';
    return '';
  }

  const activeSection = getActiveSection();

  interface NavLink {
    key: string;
    label: string;
    href: string;
    show: boolean;
  }

  const navLinks: NavLink[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', show: !!isAdmin },
    { key: 'portal',    label: 'Portal',    href: '/portal',    show: true },
    { key: 'events',    label: 'Events',    href: '/events',    show: true },
    { key: 'rules',     label: 'Rules',     href: '/rules',     show: true },
    { key: 'settings',  label: 'Settings',  href: '/settings',  show: !!isSuperUser },
  ].filter(l => l.show);

  const styles: Record<string, React.CSSProperties> = {
    topbar: {
      position: 'sticky',
      top: 0,
      zIndex: 100,
      height: '48px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      borderLeft: '3px solid var(--khaki)',
      display: 'flex',
      alignItems: 'center',
      padding: '0',
      overflow: 'hidden',
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      textDecoration: 'none',
      color: 'var(--khaki)',
      fontFamily: 'var(--font-heading)',
      fontSize: '14px',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap' as const,
      padding: '0 20px',
      height: '48px',
      borderRight: '1px solid var(--border)',
      flexShrink: 0,
    },
    logoIcon: {
      width: '22px',
      height: '22px',
      background: 'var(--khaki)',
      borderRadius: '3px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    nav: {
      display: 'flex',
      alignItems: 'center',
      height: '48px',
      flexShrink: 0,
    },
    navLink: {
      display: 'flex',
      alignItems: 'center',
      height: '48px',
      padding: '0 16px',
      color: 'var(--text-muted)',
      textDecoration: 'none',
      fontSize: '11px',
      letterSpacing: '0.09em',
      textTransform: 'uppercase' as const,
      borderRight: '1px solid var(--border)',
      whiteSpace: 'nowrap' as const,
      transition: 'color 0.15s, background 0.15s',
    },
    navLinkActive: {
      color: 'var(--khaki)',
      background: 'rgba(200,184,122,0.1)',
      cursor: 'default',
      pointerEvents: 'none' as const,
    },
    breadcrumb: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      height: '48px',
      padding: '0 16px',
      borderRight: '1px solid var(--border)',
      fontSize: '11px',
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      flexShrink: 0,
      minWidth: 0,
    },
    breadcrumbLink: {
      color: 'var(--text-muted)',
      textDecoration: 'none',
      whiteSpace: 'nowrap' as const,
    },
    breadcrumbCurrent: {
      color: 'var(--text)',
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '200px',
    },
    breadcrumbSep: {
      color: 'var(--text-dim)',
      opacity: 0.4,
      flexShrink: 0,
    },
    right: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginLeft: 'auto',
      padding: '0 16px',
      flexShrink: 0,
    },
    themeToggle: {
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: 'var(--surface2, var(--surface))',
      border: '1px solid var(--border)',
      color: 'var(--text-muted)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '13px',
    },
    avatar: {
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      border: '1px solid var(--border)',
      background: 'rgba(200,184,122,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--khaki)',
      fontSize: '11px',
      fontWeight: 'bold' as const,
      overflow: 'hidden',
      flexShrink: 0,
    },
    signOut: {
      background: 'none',
      border: 'none',
      color: 'var(--text-muted)',
      fontSize: '11px',
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      cursor: 'pointer',
      padding: '4px 0',
      fontFamily: 'var(--font-body)',
    },
  };

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'slate' ? 'light' : 'slate';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('draftman-theme', next);
  }

  return (
    <div style={styles.topbar}>
      {/* Logo */}
      <Link href="/dashboard" style={styles.logo}>
        <div style={styles.logoIcon}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="DM5" width={16} height={16} style={{ display: 'block' }} />
        </div>
        DRAFTMAN5.0
      </Link>

      {/* Nav links */}
      <nav style={styles.nav}>
        {navLinks.map(link => {
          const isActive = link.key === activeSection;
          return isActive ? (
            <span
              key={link.key}
              style={{ ...styles.navLink, ...styles.navLinkActive }}
            >
              {link.label}
            </span>
          ) : (
            <Link
              key={link.key}
              href={link.href}
              style={styles.navLink}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Breadcrumbs (event sub-pages etc.) */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div style={styles.breadcrumb}>
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {i > 0 && <span style={styles.breadcrumbSep}>›</span>}
                {isLast || !crumb.href ? (
                  <span style={styles.breadcrumbCurrent}>{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} style={styles.breadcrumbLink}>{crumb.label}</Link>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Right side */}
      <div style={styles.right}>
        <button style={styles.themeToggle} onClick={toggleTheme} title="Toggle theme">
          ◑
        </button>

        <div style={styles.avatar}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={username} width={28} height={28} style={{ display: 'block' }} />
          ) : (
            initial
          )}
        </div>

        <button
          style={styles.signOut}
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
