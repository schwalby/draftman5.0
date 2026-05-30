'use client';

import { Topbar } from '@/components/Topbar';
import { useEffect, useRef, useState } from 'react';
import styles from './devlog.module.css';

interface Entry {
  session: string;
  date: string;
  heading: string;
  body: string;
  tags: string[];
}

const entries: Entry[] = [
  {
    session: '01',
    date: 'April 13, 2026',
    heading: 'The ground floor.',
    body: 'Started the rebuild from zero. Old DODTourneys archived. Got the landing page, Discord OAuth, and dashboard up and running. First user auto-assigns as organizer. The 3-step event creation wizard was designed and prototyped but sitting in downloads — blocked on a font decision. Evaluating Bebas Neue, Oswald, and Barlow Condensed. Fraktion Mono and KH Interference confirmed for body and accent. Database schema in: six tables, 27 maps seeded, realtime enabled on signups, draft_picks, and teams.',
    tags: ['Auth', 'Dashboard', 'Wizard prototyped', 'DB schema', '27 maps seeded'],
  },
  {
    session: '02',
    date: 'April 21, 2026',
    heading: 'Features start stacking up.',
    body: 'Oswald picked as the heading font — font decision unblocked the wizard, now installed and tested end-to-end. Event detail page fully working: players sign up with 1 or 2 classes stored as a text array. Signup list in a 4-column grid, confirmed spots 1–48, ringer overflow below. Realtime updates live. Built the Topbar component — sticky, khaki accent, breadcrumb, Discord avatar. Dashboard signup counts with color scale tied to the 48-player goal. Fixed a silent PATCH bug and disabled RLS after a policy gap was silently returning nothing.',
    tags: ['Fonts live', 'Wizard installed', 'Event detail', 'Multi-class signup', 'Realtime', 'Topbar'],
  },
  {
    session: '03',
    date: 'April 22, 2026',
    heading: 'The admin layer takes shape.',
    body: 'Built the admin signup drawer — 480px wide, slides in from the right, drag-to-reorder with a ghost clone that follows the cursor, flag/unflag, ringer toggle, inline note editor, tooltips on everything. All changes PATCH to Supabase immediately. Added ringer column to the DB and a PATCH route for individual signups. Ringer logic has two paths: auto (past position 48) or admin manual toggle. Fixed withdraw signup. Rebuilt landing page, added /rules, wired Rules link into Topbar. Light/dark theme toggle added — persists via localStorage, no flash. Branding locked as DRAFTMAN5.0.',
    tags: ['Signup drawer', 'Ringer logic', 'PATCH route', 'Rules page', 'Theme toggle', 'Branding locked'],
  },
  {
    session: '04',
    date: 'April 22, 2026',
    heading: 'Team setup lands.',
    body: 'Team setup page built and working. Captains auto-populate from signup flags with a dropdown separating captains from regular players via optgroups. SignupDrawer accessible from the team setup page. Captain toggle added — event-scoped, stored on signups.captain. Flex class made mutually exclusive. Player cap is now dynamic, driven by events.capacity, with a pill selector in the edit wizard. Edit button shows for both draft and scheduled events. Lock In & Start Draft saves teams and navigates to the draft board. Topbar added to wizard and edit pages. Installer scripts now auto-archive with a timestamp.',
    tags: ['Team setup', 'Captain toggle', 'Flex exclusivity', 'Dynamic cap', 'Lock in & draft'],
  },
  {
    session: '05',
    date: 'April 23, 2026',
    heading: 'Roles defined, mockup approved.',
    body: 'Captain auto-populate was broken — fixed by reading s.captain instead of s.users?.is_captain. SignupDrawer wired into team setup. Draft board HTML mockup built with interactivity confirmed, though a CSS gap bug with the .cols flex layout was pushing the player pool to the bottom of the viewport. Role hierarchy formally defined: SuperUser, Draft Admin, Captain (event-scoped), Player. Railway chosen over Vercel for hosting after Vercel\'s April 2026 breach.',
    tags: ['Captain fix', 'Draft board mockup', 'Role hierarchy', 'Railway chosen'],
  },
  {
    session: '06',
    date: 'April 23, 2026',
    heading: 'Settings, dashboard redesign, and going live.',
    body: 'Settings page built — SuperUser only, promotes and demotes Draft Admins and SuperUsers, views all registered users. Dashboard redesigned with KH Interference fonts, progress bars, and a published/unpublished section split. Player portal page added. Role-based auth redirects implemented so the right users land in the right places. Deployed to Railway. The platform is now live.',
    tags: ['Settings page', 'Dashboard redesign', 'Player portal', 'Role-based auth', 'Live on Railway'],
  },
  {
    session: '07',
    date: 'April 24, 2026',
    heading: 'The draft board ships.',
    body: 'Live draft board built and working end-to-end. Snake draft order, realtime pick updates, pick log (newest at top), available player pool at the bottom, undo last pick, confirm modal, and the two-column/two-row layout threshold — all working. Timer is optional, shows a countdown, turns red at 20 seconds, and never auto-picks. The CSS gap bug from Session 05 resolved. The biggest piece of the platform is now in place.',
    tags: ['Draft board', 'Snake draft', 'Realtime picks', 'Timer', 'Undo', 'Confirm modal'],
  },
  {
    session: '08',
    date: 'April 25, 2026',
    heading: 'Polish, power features, and a slug disaster.',
    body: 'Added icon and favicon. Topbar rebuilt, landing page restored, theme persistence fixed. Draft-in-progress lockout added across all pages — also added a rejoin draft button. Reset draft now has a confirmation modal. Dashboard split into three sections. Right-click context menu on the draft board: change class (multi-select), undo pick, ringer toggle, view player portal. Team headers got inline rename and their own right-click. Player profile page and a users API built. The [userId] slug routing caused a conflict that took significant effort to resolve.',
    tags: ['Draft lockout', 'Rejoin draft', 'Right-click menus', 'Player profile', 'Inline rename', 'Slug fix'],
  },
  {
    session: '09',
    date: 'April 25, 2026',
    heading: 'Tournament system, built in one session.',
    body: 'The entire tournament system went from nothing to end-to-end: six new DB tables, five API routes, a full tournament page with Round Robin (two-group standings and results) and a Playoff Bracket (cross-seeded QF → SF → Final → Champion), a Confirmation Queue tab, right-click context menus, and admin override modals. Realtime via Supabase throughout. Bot confirmation flow designed: KTP bot reports → awaiting_confirmation → admin or captain confirms → standings recalculate → bracket advances. Fixed a Settings page bug where the PATCH handler was missing from the users [id] route.',
    tags: ['Tournament system', 'Round robin', 'Playoff bracket', 'Bot flow designed', 'Confirmation queue'],
  },
  {
    session: '10',
    date: 'April 27, 2026',
    heading: 'Wizard updates, tournament setup wired in.',
    body: 'Added a 48/60 player cap pill to the event creation wizard. Built a tournament setup wizard and deployed it. Wired a START TOURNAMENT button from the draft board. Fixed the tournament API POST (wrong key: team_ids). One thing still dangling: clicking START TOURNAMENT was opening the new event page instead of the tournament page — navigation target corrected.',
    tags: ['Cap pill', 'Tournament wizard', 'Start tournament', 'API fix'],
  },
  {
    session: '11',
    date: 'April 28, 2026',
    heading: 'Tournament page goes live and works.',
    body: 'Tournament page fully built and live. Live score updates working — data fetches directly from Supabase to bypass Railway\'s proxy cache. RLS disabled and anon grants added for tournament tables. Standings recalculation confirmed working. Switched from a singleton supabaseAdmin to a getSupabaseAdmin() factory function across all tournament routes. Fixed a query bug (group_id not tournament_id) and a race condition where groups were being fetched before Promise.all resolved. Using .maybeSingle() throughout.',
    tags: ['Tournament live', 'Score updates', 'Standings calc', 'getSupabaseAdmin()', 'Race condition fix'],
  },
  {
    session: '12',
    date: 'April 28–29, 2026',
    heading: 'Terminology sweep, champion declaration, draft pool filtering.',
    body: 'Renamed Tournament → Draft throughout the UI. Fixed the event status flow so events go to in_progress on start, not completed. Built a declare champion feature. Dashboard now shows a completed section with the winner inline. Smart navigation button added to the event detail page. Per-team slot filtering added to the draft pool. Third class fully added as a distinct type with its own label, color, and render logic. Class assignment in the confirm modal partially working — picker not triggering for multi-class players, flagged for next session.',
    tags: ['Terminology sweep', 'Declare champion', 'Draft pool filter', 'Third class', 'Status flow fix'],
  },
  {
    session: '13',
    date: 'April 29, 2026',
    heading: 'Bugs squashed, dev tools land.',
    body: 'Fixed two long-standing draft board bugs: captain\'s signup class now counts against team slot totals so their role can\'t be drafted twice, and the confirm modal class picker now correctly shows options for multi-class players. Bracket match cards got a status bar overhaul — CONFIRMED, COMPLETE, AWAITING CONFIRMATION, LIVE, and PENDING all render correctly. Event name added to the draft heading so you always know which draft you\'re in. Manage Players drawer wired into the draft board with a dedicated button in the control bar. SignupDrawer updated with a capacity prop (no more hardcoded 48), Third class in the legend, and an onUpdate callback that refreshes the pool after a ringer is promoted. Settings page now splits real and fake users, with test accounts collapsed behind a toggle by default. Dev tools section added: one-click seed tool generates a full 6v6 test draft via a dedicated /api/admin/seed route that bypasses the session user check. Dev mode auto-grant added — NEXT_PUBLIC_DEV_MODE=true automatically gives Draft Admin access to any real user on first login, disabled by removing the env var before go-live. Simulate Bot Report added as a right-click option on pending bracket matches — auto-generates a random score and submits it as if the KTP bot reported it, sending the match to Awaiting Confirmation for full queue testing.',
    tags: ['Captain slot fix', 'Class picker fix', 'Bracket status bar', 'Manage Players', 'Seed tool', 'Dev mode', 'Simulate bot report'],
  },
  {
    session: '14',
    date: 'April 30, 2026',
    heading: 'Audit trail, Steam IDs, and the bot goes live.',
    body: 'Three major systems shipped in one session. The audit log captures every meaningful action on the platform — match edits, confirmations, rejections, role changes, signup flags, notes, ringer toggles, user deletes, and champion declarations — all written to a new audit_log table via a shared logAudit() helper. The log page lives at a hidden URL, SuperUser only, with keyword search and action filtering. Steam ID collection was added next: players enter their Steam ID on the portal, it validates against the Steam Web API, stores the raw input for display and SteamID64 for bot matching, and pulls their Steam avatar and display name automatically. Event signup is now gated — no Steam ID, no signup. Finally, DRAFT_MAN5.0 went live as a Discord bot: it watches the #results-screenshots channel, parses KTP Score Bot embeds on match complete, extracts Steam IDs, cross-references drafted rosters, and auto-reports confirmed results to the API. The bot runs as a separate Railway service and was online and watching the channel before the session ended.',
    tags: ['Audit log', 'Steam ID validation', 'Steam avatar', 'Signup gate', 'Discord bot live', 'Railway bot service'],
  },
  {
    session: '15',
    date: 'April 30, 2026',
    heading: 'The whole nav gets a spine.',
    body: 'Topbar fully standardized across every page — sidebar ripped out of dashboard, portal, and events. Nav links now derived automatically from session role, no props needed. The items prop is gone, replaced with a breadcrumbs prop across all 11 affected pages. Portal page redesigned: welcome header, two-column profile row (Discord card left, Steam card right with avatar, Steam name, raw ID, and edit button), and open event cards with action buttons pinned to the bottom. Draft holding page fully designed but not yet built — role-gated access to the draft board, with a player-facing page that renders in three states: stream embed with pick ticker and secondary streams row, a streamless fallback with pick count, and an auto-flip to team reveal when the draft completes via Supabase realtime. Requires a stream_url column on the events table and a field in the wizard and edit page.',
    tags: ['Nav standardization', 'Topbar breadcrumbs', 'Sidebar removed', 'Portal redesign', 'Draft holding page designed'],
  },
  {
    session: '16',
    date: 'April 30, 2026',
    heading: 'Built for the phone.',
    body: 'The draft holding page went from design to shipped: role-gated access at the draft route, with a player-facing page that renders in three states depending on draft status and whether a stream URL is configured. Stream embeds handle both Twitch and YouTube via URL transform. stream_url column added to the events table and wired into the wizard and edit page. Then the full mobile responsive pass: landing page title no longer overflows, dashboard event cards stack vertically with buttons wrapping below, portal profile cards and event grids collapse to single column, event detail player grid drops from four columns to two, and the draft holding page tightens up on small screens. The Topbar got a hamburger menu — on mobile the nav links hide and a drawer slides down with all links and sign out. One component change, every page fixed.',
    tags: ['Draft holding page', 'stream_url', 'Mobile responsive', 'Hamburger menu', 'Topbar'],
  },
  {
    session: '17',
    date: 'May 1, 2026',
    heading: 'Steam verification designed.',
    body: 'Designed and built the full Steam OAuth verification flow — seven files generated, downloaded, but not yet installed pending a security review. The flow: player runs /verify in Discord, bot DMs a one-time link, player clicks through to a verify page, logs in with Steam, and the platform validates account age (30+ days), DoD ownership (App ID 30), and profile visibility. On pass, the bot grants the Verified Discord role and sends a confirmation DM. Discovery: Discord native Linked Roles cannot expose Steam ID to bots, so a custom Steam OpenID 2.0 flow was required. Six bugs identified in code review before installation: URLSearchParams cast, race condition on token consumption, missing rate limiting, misleading error for missing timecreated, Manage Roles permission gap, and fire-and-forget grant call.',
    tags: ['Steam verify designed', 'Steam OpenID 2.0', 'One-time tokens', 'Six bugs flagged', 'Not yet installed'],
  },
  {
    session: '18',
    date: 'May 14, 2026',
    heading: 'Security audit and bot planning.',
    body: 'Ran a full API route security scan across all 25 routes — every route confirmed to have session checks, 401/403 responses, and appropriate role gating. Identified that NEXT_PUBLIC_DEV_MODE=true was live in Railway, granting Draft Admin to all logged-in users — left intentionally for testing but flagged for removal before go-live. Investigated CVE-2026-31431 (Copy Fail Linux LPE) — assessed as Railway\'s responsibility to patch, low risk given app-layer auth posture. Built comprehensive player experience documentation and system flowcharts covering player journey, admin flow, roles, draft mechanics, and data/systems architecture. Planned and specced the unified 1911.gg bot: Feature Set 1 (verification), Feature Set 2 (draft/tournament bridge), and Feature Set 3 (12 man queue as NeatQueue replacement). Documented live NeatQueue behavior via screenshots for reference.',
    tags: ['Security audit', 'CVE-2026-31431', 'API auth confirmed', 'Player docs', 'Flowcharts', 'Bot spec'],
  },
  {
    session: '19',
    date: 'May 15, 2026',
    heading: 'Verify ships. Portal gets smarter.',
    body: 'The Steam verify feature went from designed-but-blocked to fully live. Six bugs patched across five files: URLSearchParams now uses .forEach() for correct Steam OpenID validation, token consumption made atomic with a single UPDATE+WHERE to prevent race conditions, rate limiting added (3 attempts per 10 minutes per Discord ID), missing timecreated now redirects to the correct error state, the grant call is now properly awaited with error logging, and the ws package was added to the bot for Supabase realtime on Node 20. The verify page was redesigned from a floating card to a full landing-page-style experience matching the DRAFTMAN5.0 aesthetic — big logo, grid background, feature cards. Successful verification now redirects to /portal?verified=1 instead of a static success page. The portal received a verified banner (centered, green, dismissable, no auto-dismiss), a ✓ Verified badge on the Steam card, and the Edit button moved to the card header. The bot verify flow was redesigned: it now checks for a DRAFTMAN account first — if not found, it sends an ephemeral message with a login link and an "I\'m logged in" button, so players never have to retype the command. discord.js ButtonBuilder and ActionRowBuilder wired in for the first time.',
    tags: ['Steam verify live', 'Six bugs patched', 'Verify page redesigned', 'Portal verified banner', 'Verified badge', 'Bot button interactions', 'Atomic token consumption', 'ws package'],
  },
  {
    session: '20',
    date: 'May 29, 2026',
    heading: 'The bracket gets fixed and history ships.',
    body: 'Turns out the bracket had been quietly broken the whole time — seeding logic was never actually reading ranked performance, so quarterfinal matchups were assigned by insertion order instead of standings. Found and fixed, along with two other silent failures: seed badges only rendering correctly for two of the eight teams, and the declare champion button failing without any visible error. With the tournament logic finally trustworthy, shipped the two history pages. Every completed event now has a permanent summary: the full bracket, round robin standings, results by round, and team rosters with pick order. Half-score support added too — the score bot now reports first and second half breakdowns separately and they show up on team pages.',
    tags: ['Bracket seeding fix', 'Declare champion fix', 'Event summary page', 'Team detail page', 'Half scores'],
  },
  {
    session: '21',
    date: 'May 29, 2026',
    heading: 'Design system locked. Warmth added.',
    body: 'Found the root cause of something that had felt off about the platform for weeks: the gold accent colour had been accidentally mapped to steel blue somewhere in a previous migration, so every heading, button, and badge across the entire app was rendering cold. One variable change cascaded the correct warm gold back across everything instantly — logo, headings, role badges, champion cards, the draft timer, all of it. With the palette corrected, formalised the mockup-first workflow: the HTML mockup files in the project root are now the authoritative visual spec, and any live page that diverges is a bug. Followed that with a micro-interaction pass — hover lifts, spotlight effects on cards, animated nav underlines, a reactive dot-grid canvas on the landing page, and scroll reveal animations on the rules page. The dark theme toggle got removed. One colour scheme, done right.',
    tags: ['Colour system fixed', 'Mockup-first workflow', 'Micro-interactions', 'Reactive canvas', 'Scroll reveals', 'Dark theme removed'],
  },
  {
    session: '22',
    date: 'May 30, 2026',
    heading: 'The bot gets manners and a mouth.',
    body: 'Gave the Discord bot its first real UX pass. Biggest fix: all command interactions are now ephemeral — only the person running the command sees the class picker and menus. Previously other players could watch someone choose their role in real time, which was causing problems during testing. Fixed a FLEX bug that was quietly letting players add a second class after picking it. Added /updaterole so players can change their class on an existing signup without having to withdraw and re-signup. Public channel announcements expanded: every signup, checkin, and withdrawal now posts an embed with a direct link to the event. Withdraw got multi-select support — you can pull out of more than one event at once. The session ended with a full planning conversation about draft day automation: reminders, check-in announcements with a button, automatic voice channel setup, match schedule broadcasting, score monitoring, and bracket progression. The full pipeline is mapped out, ready to build.',
    tags: ['Ephemeral commands', 'FLEX fix', '/updaterole', 'Public announcements', 'Event links', 'Multi-select withdraw', 'Draft day pipeline planned'],
  },
];

export default function DevLog() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [glowing, setGlowing] = useState<Set<number>>(new Set());
  const [copiedSession, setCopiedSession] = useState<string | null>(null);

  const copyAnchor = (session: string) => {
    const url = `${window.location.origin}/dev.log#session-${session}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedSession(session);
    setTimeout(() => setCopiedSession(null), 1800);
  };

  // Reactive dot grid canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SPACING = 32, DOT_R = 1.1, INFLUENCE = 100, PUSH = 26;
    type Dot = { ox: number; oy: number; x: number; y: number };
    let dots: Dot[] = [];
    let mx = -999, my = -999, animId = 0;

    // Alias to non-nullable — TypeScript narrowing doesn't persist into nested functions
    const cv: HTMLCanvasElement = canvas;
    const cx: CanvasRenderingContext2D = ctx;

    function build() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      dots = [];
      for (let x = SPACING / 2; x < cv.width; x += SPACING)
        for (let y = SPACING / 2; y < cv.height; y += SPACING)
          dots.push({ ox: x, oy: y, x, y });
    }

    function draw() {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const d of dots) {
        const dx = d.ox - mx, dy = d.oy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < INFLUENCE && dist > 0) {
          const f = (INFLUENCE - dist) / INFLUENCE;
          d.x += ((d.ox + (dx / dist) * f * PUSH) - d.x) * 0.22;
          d.y += ((d.oy + (dy / dist) * f * PUSH) - d.y) * 0.22;
        } else {
          d.x += (d.ox - d.x) * 0.07;
          d.y += (d.oy - d.y) * 0.07;
        }
        const inRange = dist < INFLUENCE;
        const alpha = inRange ? 0.045 + (1 - dist / INFLUENCE) * 0.2 : 0.045;
        cx.beginPath();
        cx.arc(d.x, d.y, DOT_R, 0, Math.PI * 2);
        cx.fillStyle = inRange
          ? `rgba(67,206,162,${alpha})`
          : `rgba(67,206,162,${alpha * 0.6})`;
        cx.fill();
      }
      animId = requestAnimationFrame(draw);
    }

    build();
    draw();

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    const onResize = () => build();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, []);


  // Scroll reveal + dot glow
  useEffect(() => {
    let batchCount = 0;
    const observer = new IntersectionObserver(
      (obs) => {
        // Entries that fire in the same callback batch get staggered
        const intersecting = obs.filter(o => o.isIntersecting);
        intersecting.forEach((o, batchIdx) => {
          const idx = parseInt(o.target.getAttribute('data-idx') || '0');
          const el = o.target as HTMLElement;
          el.style.setProperty('--stagger', `${(batchCount + batchIdx) * 0.07}s`);
          setRevealed(prev => new Set(prev).add(idx));
          setTimeout(() => setGlowing(prev => new Set(prev).add(idx)), 400 + batchIdx * 70);
          observer.unobserve(o.target);
        });
        if (intersecting.length > 0) batchCount = 0;
      },
      { threshold: 0.1 }
    );
    entryRefs.current.forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Reactive canvas — fixed, viewport only */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <Topbar />

      <div style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: 600,
        margin: '0 auto',
        padding: '4rem 2rem 8rem',
      }}>

        {/* Header */}
        <div style={{ marginBottom: '3.5rem' }}>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            letterSpacing: '0.25em',
            textTransform: 'uppercase' as const,
            color: 'var(--text-dim)',
            marginBottom: '0.5rem',
          }}>
            Build history — DRAFTMAN5.0
          </div>
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 56,
            fontWeight: 500,
            letterSpacing: '0.04em',
            lineHeight: 1,
            marginBottom: '0.75rem',
            background: 'linear-gradient(to right, #185a9d, #43cea2)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            dev.log
          </div>
          <div style={{
            display: 'flex',
            gap: '1.25rem',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-dim)',
            letterSpacing: '0.08em',
            flexWrap: 'wrap' as const,
            alignItems: 'center',
          }}>
            <span style={{ color: '#43cea2' }}>{entries.length} sessions</span>
            <span style={{ color: 'rgba(67,206,162,0.2)' }}>·</span>
            <span>April – May 2026</span>
            <span style={{ color: 'rgba(67,206,162,0.2)' }}>·</span>
            <span>Next.js + Supabase + Discord bot</span>
          </div>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', paddingLeft: '2.4rem' }}>

          {/* Teal → blue gradient vertical line */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 12,
            bottom: 40,
            width: 1,
            background: 'linear-gradient(to bottom, #43cea2 0%, #185a9d 50%, rgba(24,90,157,0.03) 100%)',
          }} />

          {entries.map((entry, i) => (
            <div
              key={entry.session}
              id={`session-${entry.session}`}
              style={{ position: 'relative', paddingBottom: '2rem' }}
            >
              {/* Timeline dot */}
              <div className={`${styles.dot} ${glowing.has(i) ? styles.glowing : ''}`} />

              {/* Entry card */}
              <div
                ref={el => { entryRefs.current[i] = el; }}
                data-idx={String(i)}
                className={`${styles.entry} ${revealed.has(i) ? styles.revealed : ''}`}
                style={{ animationDelay: i < 6 ? `${i * 0.1}s` : '0s' }}
              >
                {/* Animated top bar */}
                <div className={styles.topBar} />

                {/* Meta row */}
                <div className={styles.metaRow}>
                  <span className={styles.badge}>
                    <span className={styles.badgeInner}>Session {entry.session}</span>
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    color: 'var(--khaki)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const,
                    opacity: 0.75,
                  }}>
                    {entry.date}
                  </span>
                  <button
                    className={styles.anchorBtn}
                    onClick={() => copyAnchor(entry.session)}
                    title={`Copy link to session ${entry.session}`}
                  >
                    {copiedSession === entry.session ? '✓' : '#'}
                  </button>
                </div>

                {/* Heading */}
                <div style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 20,
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                  marginBottom: '0.55rem',
                  background: 'linear-gradient(to right, #43cea2, #185a9d)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  {entry.heading}
                </div>

                {/* Body */}
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  lineHeight: 1.9,
                  margin: '0 0 0.9rem',
                  maxWidth: '100%',
                }}>
                  {entry.body}
                </p>

                {/* Tags */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap' as const,
                  gap: 5,
                }}>
                  {entry.tags.map(tag => (
                    <span key={tag} className={styles.tagWrap}>
                      <span className={styles.tagInner}>{tag}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--border)',
          marginTop: '1rem',
          paddingTop: '1.5rem',
          fontFamily: 'var(--font-body)',
          fontSize: 10,
          color: 'var(--text-dim)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
        }}>
          DRAFTMAN5.0 · future: 1911.gg
        </div>
      </div>
    </>
  );
}
