'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { ReactNode } from 'react';

/* ── AppShell ──────────────────────────────────────────────────────────────
   Reimagined navigation shell: persistent left icon-rail + top ribbon,
   replacing <Topbar/>. Role-aware (mirrors the Topbar nav rules). Pages
   render their own content as children. Part of the feat/ui-reimagined
   rebuild — convert pages from <Topbar/> to <AppShell> one at a time. */

interface Crumb { label: string; href?: string }
interface Props { children: ReactNode; crumbs?: Crumb[] }

type Item = { key: string; label: string; href: string; show: boolean; icon: ReactNode };

const ICONS: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  portal: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  events: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  rules: <><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h8M8 11h8M8 15h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z" /></>,
};

export function AppShell({ children, crumbs }: Props) {
  const { data: session } = useSession();
  const pathname = usePathname() || '';

  const isOrganizer = session?.user?.isOrganizer;
  const isSuperUser = session?.user?.isSuperUser;
  const isAdmin = isOrganizer || isSuperUser;

  const avatar = session?.user?.discordAvatar;
  const discordId = session?.user?.discordId;
  const username = session?.user?.discordUsername || session?.user?.name || '?';
  const initial = username.charAt(0).toUpperCase();
  const avatarUrl = avatar && discordId ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : null;

  const items: Item[] = [
    { key: 'dashboard', label: 'Home',     href: '/dashboard', show: !!isAdmin,     icon: ICONS.dashboard },
    { key: 'portal',    label: 'Portal',   href: '/portal',    show: true,           icon: ICONS.portal },
    { key: 'events',    label: 'Events',   href: '/events',    show: true,           icon: ICONS.events },
    { key: 'rules',     label: 'Rules',    href: '/rules',     show: true,           icon: ICONS.rules },
    { key: 'settings',  label: 'Settings', href: '/settings',  show: !!isSuperUser,  icon: ICONS.settings },
  ].filter(i => i.show);

  function activeKey(): string {
    if (pathname.startsWith('/dashboard') || pathname === '/events/new' || pathname.includes('/edit')) return 'dashboard';
    if (pathname.startsWith('/portal')) return 'portal';
    if (pathname.startsWith('/events')) return 'events';
    if (pathname.startsWith('/rules')) return 'rules';
    if (pathname.startsWith('/settings')) return 'settings';
    return '';
  }
  const active = activeKey();

  return (
    <div className="as-root">
      <style dangerouslySetInnerHTML={{ __html: `
        .as-root { display: grid; grid-template-columns: 64px 1fr; min-height: 100vh; }
        .as-rail { position: sticky; top: 0; height: 100vh; background: var(--surface); border-right: 1px solid var(--border);
          display: flex; flex-direction: column; align-items: center; padding: 11px 0; gap: 5px; z-index: 40; }
        .as-mk { width: 36px; height: 36px; border-radius: 9px; background: var(--grad, var(--khaki)); color: #06120f;
          font-family: var(--font-heading); font-weight: 700; font-size: 18px; display: flex; align-items: center; justify-content: center;
          margin-bottom: 10px; box-shadow: 0 6px 18px rgba(35,227,192,0.28); text-decoration: none; }
        .as-nav { position: relative; width: 46px; height: 46px; border-radius: 11px; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 3px; color: var(--text-muted); text-decoration: none; }
        .as-nav svg { width: 19px; height: 19px; stroke: currentColor; fill: none; stroke-width: 1.7; }
        .as-nav .l { font-size: 7.5px; letter-spacing: 0.06em; text-transform: uppercase; }
        .as-nav:hover { color: var(--text-dim); background: var(--surface2); }
        .as-nav.on { color: var(--khaki); background: var(--acc-soft, rgba(35,227,192,0.12)); }
        .as-nav.on::before { content: ''; position: absolute; left: -11px; top: 11px; bottom: 11px; width: 3px; border-radius: 2px; background: var(--grad, var(--khaki)); }
        .as-sp { flex: 1; }
        .as-you { width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid var(--khaki); color: var(--khaki);
          display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; overflow: hidden; flex-shrink: 0; }
        .as-main { min-width: 0; display: flex; flex-direction: column; }
        .as-ribbon { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 16px; height: 46px; padding: 0 18px;
          background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
        .as-wm { font-family: var(--font-heading); font-weight: 700; letter-spacing: 0.02em; font-size: 15px; color: var(--text); text-decoration: none; }
        .as-wm b { color: var(--khaki); font-weight: 700; }
        .as-crumb { display: flex; align-items: center; gap: 7px; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); min-width: 0; }
        .as-crumb a { color: var(--text-muted); text-decoration: none; }
        .as-crumb a:hover { color: var(--text-dim); }
        .as-crumb .cur { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
        .as-crumb .sep { opacity: 0.4; }
        .as-right { margin-left: auto; display: flex; align-items: center; gap: 14px; }
        .as-out { background: none; border: none; color: var(--text-muted); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
          cursor: pointer; font-family: var(--font-body); }
        .as-out:hover { color: var(--text-dim); }
        @media (max-width: 640px) {
          .as-root { grid-template-columns: 52px 1fr; }
          .as-nav .l { display: none; }
          .as-ribbon { padding: 0 12px; gap: 10px; }
        }
      ` }} />

      {/* icon rail */}
      <nav className="as-rail">
        <Link href={isAdmin ? '/dashboard' : '/portal'} className="as-mk" aria-label="Home">D</Link>
        {items.map(it => (
          <Link key={it.key} href={it.href} className={`as-nav ${it.key === active ? 'on' : ''}`} title={it.label}>
            <svg viewBox="0 0 24 24">{it.icon}</svg>
            <span className="l">{it.label}</span>
          </Link>
        ))}
        <div className="as-sp" />
        <div className="as-you">
          {avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={avatarUrl} alt={username} width={36} height={36} style={{ display: 'block' }} />
            : initial}
        </div>
      </nav>

      {/* main column */}
      <div className="as-main">
        <div className="as-ribbon">
          <Link href={isAdmin ? '/dashboard' : '/portal'} className="as-wm">DRAFTMAN<b>5.0</b></Link>
          {crumbs && crumbs.length > 0 && (
            <div className="as-crumb">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {i > 0 && <span className="sep">›</span>}
                    {last || !c.href ? <span className="cur">{c.label}</span> : <Link href={c.href}>{c.label}</Link>}
                  </span>
                );
              })}
            </div>
          )}
          <div className="as-right">
            <button className="as-out" onClick={() => signOut({ callbackUrl: '/' })}>Sign Out</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export default AppShell;
