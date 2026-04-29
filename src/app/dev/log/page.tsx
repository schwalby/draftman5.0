'use client';

import { Topbar } from '@/components/Topbar';

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
];

export default function DevLog() {
  return (
    <>
      <Topbar />
      <div style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: '3rem 1.5rem 6rem',
      }}>

        {/* Header */}
        <div style={{
          marginBottom: '3rem',
        }}>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase' as const,
            color: 'var(--text-dim)',
            marginBottom: '0.4rem',
          }}>
            Build history
          </div>
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 38,
            fontWeight: 500,
            color: 'var(--khaki)',
            letterSpacing: '0.04em',
            lineHeight: 1,
            marginBottom: '0.4rem',
          }}>
            dev.log
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--text-dim)',
            letterSpacing: '0.06em',
          }}>
            {entries.length} sessions · April 2026 · Next.js + Supabase + Discord OAuth
          </div>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative' }}>

          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 0,
            width: 1,
            background: 'linear-gradient(to bottom, var(--khaki), rgba(200,184,122,0.04))',
          }} />

          {entries.map((entry) => (
            <div
              key={entry.session}
              style={{
                position: 'relative',
                paddingLeft: '2rem',
                paddingBottom: '2.25rem',
              }}
            >
              {/* Dot */}
              <div style={{
                position: 'absolute',
                left: -4,
                top: 7,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: 'var(--khaki)',
                border: '2px solid var(--bg)',
                boxShadow: '0 0 0 1px var(--khaki)',
              }} />

              {/* Meta row */}
              <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.75rem',
                marginBottom: '0.4rem',
                flexWrap: 'wrap' as const,
              }}>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'var(--khaki)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                }}>
                  {entry.date}
                </span>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase' as const,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  padding: '1px 7px',
                  borderRadius: 2,
                }}>
                  Session {entry.session}
                </span>
              </div>

              {/* Heading */}
              <div style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 20,
                fontWeight: 500,
                color: 'var(--text)',
                letterSpacing: '0.03em',
                marginBottom: '0.5rem',
              }}>
                {entry.heading}
              </div>

              {/* Body */}
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--text-dim)',
                lineHeight: 1.8,
                margin: 0,
                maxWidth: 580,
              }}>
                {entry.body}
              </p>

              {/* Tags */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap' as const,
                gap: 5,
                marginTop: '0.75rem',
              }}>
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      padding: '2px 8px',
                      borderRadius: 2,
                      background: 'rgba(200,184,122,0.07)',
                      color: 'var(--khaki)',
                      border: '1px solid rgba(200,184,122,0.18)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
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
          fontSize: 11,
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
