'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';

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
  const [menuOpen, setMenuOpen] = useState(false);

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

  const mobileStyles = `
    @media (max-width: 640px) {
      .tb-nav { display: none !important; }
      .tb-hamburger { display: flex !important; }
      .tb-signout { display: none !important; }
      .tb-mobile-drawer { display: flex !important; }
      .tb-breadcrumb { display: none !important; }
    }
    .tb-hamburger { display: none; flex-direction: column; gap: 4px; padding: 8px; cursor: pointer; background: none; border: none; flex-shrink: 0; }
    .tb-hamburger span { display: block; width: 16px; height: 1.5px; background: var(--text-dim); border-radius: 1px; transition: all 0.2s; }
    .tb-mobile-drawer { display: none; position: fixed; top: 48px; left: 0; right: 0; background: var(--surface); border-bottom: 1px solid var(--border); flex-direction: column; z-index: 99; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    .tb-mobile-drawer a, .tb-mobile-drawer span.drawer-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); text-decoration: none; }
    .tb-mobile-drawer a.active-item { color: var(--khaki); }
    .tb-mobile-drawer .drawer-arrow { color: var(--text-muted); font-size: 10px; }
    .tb-mobile-drawer .drawer-signout { color: var(--text-muted); cursor: pointer; background: none; border: none; font-family: var(--font-body); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; width: 100%; text-align: left; padding: 14px 20px; border-bottom: 1px solid var(--border); }
  `;

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'slate' ? 'light' : 'slate';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('draftman-theme', next);
  }

  return (
    <div style={styles.topbar}>
      <style>{mobileStyles}</style>
      {/* Logo */}
      <Link href="/dashboard" style={styles.logo}>
        <div style={styles.logoIcon}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="DM5" width={16} height={16} style={{ display: 'block' }} />
        </div>
        DRAFTMAN5.0
      </Link>

      {/* Nav links */}
      <nav style={styles.nav} className="tb-nav">
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

      {/* Hamburger — mobile only */}
      <button className="tb-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
        <span style={menuOpen ? { transform: 'translateY(5.5px) rotate(45deg)' } : {}} />
        <span style={menuOpen ? { opacity: 0 } : {}} />
        <span style={menuOpen ? { transform: 'translateY(-5.5px) rotate(-45deg)' } : {}} />
      </button>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div className="tb-mobile-drawer">
          {navLinks.map(link => {
            const isActive = link.key === activeSection;
            return isActive ? (
              <span key={link.key} className="drawer-item active-item" onClick={() => setMenuOpen(false)}>
                {link.label} <span className="drawer-arrow">›</span>
              </span>
            ) : (
              <Link key={link.key} href={link.href} className={`active-item-no`} onClick={() => setMenuOpen(false)} style={{ color: 'var(--text-dim)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {link.label} <span className="drawer-arrow">›</span>
              </Link>
            );
          })}
          <button className="drawer-signout" onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/' }); }}>
            Sign Out
          </button>
        </div>
      )}

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
          className="tb-signout"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
