'use client'

import { Topbar } from '@/components/Topbar'

const SECTIONS = [
  {
    title: 'Player Pool & Captains',
    items: [
      'The player pool is established on a first come, first served signup basis. Any players signing up past the player limit will be <b>Ringers</b>.',
      'Captains for the event will be chosen from the player pool by the admins of the event.',
      'Any player that signs up for the event has a chance of being selected as a captain.',
      'One of the clear goals when selecting captains is to have captains of as close to equivalent skill as possible to promote fair gameplay.',
      'As slots become open in the player pool, Ringers will be slotted into open spots based on pre-draft day vs draft day check-in status.',
    ],
  },
  {
    title: 'Ringers',
    items: [
      'A cultivated list of all known players to the draft will be maintained by draft admins.',
      'The Ringer list will rank all known players into tiers based on average draft position and other factors.',
      'If a replacement player is needed, teams may get any Ringer available from the same or lower tier as the player they are replacing.',
      'If the player is from a <b>higher ringer tier</b>, both captains must agree to the use of this player.',
      'If captains cannot agree or the selection is taking longer than 5 minutes, an admin will be contacted to assign an equivalent ringer.',
    ],
  },
  {
    title: 'Check-in & Draft Day',
    phases: [
      {
        label: 'Pre-draft day',
        items: [
          'Ringers are slotted into the player list in the order they signed up.',
        ],
      },
      {
        label: 'Draft day',
        items: [
          'Players are expected to be in the draft lobby channel of the DoD 1.3 Discord by the time set by admins in order to be drafted onto a team.',
          'Ringers that are <b>checked in</b> will have higher priority than those that are not checked in.',
          'Bypassing the order of the Ringer list, assuming the Ringer is present and able to play, is not allowed.',
          'Players leaving may have their future draft signup permissions revoked. Signing up indicates you will be able to play all matches.',
        ],
      },
    ],
  },
  {
    title: 'Draft Format',
    items: [
      'Team captains pick players in a <b>serpentine (snake) draft</b> order — the pick order reverses each round.',
      'Default format is <b>6v6</b>: 2 Rifle, 1 Third (Rifle or Light), 2 Heavy, 1 Sniper per team.',
      'Flex players fill any position. The captain assigns their class at draft time.',
      'Default half length is <b>20 minutes</b>. Some events may use 15 minute halves — this will be noted on the event page.',
    ],
  },
  {
    title: 'Gameplay Rules',
    items: [
      'Approved scoreboard modifiers, HLTV models, and modifications to ClientScheme.res and TrackerScheme.res are allowed.',
      'Custom modification of player models, sprites, sounds, or any other aspect of the game not listed above is grounds for match forfeiture.',
      'Players may not use hand signals or voice commands while peeking in an attempt to make their player model harder to hit.',
      'Weapon spawning to bypass class limitations, nade exploiting, map exploiting, pixel walking, and wall glitching are <b>illegal</b>.',
      'Player boosting <b>is allowed</b>, so long as the area being boosted into is accessible by a single player without boosting.',
      'Excessive spec hopping (more than once) will result in a FF loss.',
    ],
  },
  {
    title: 'Demos & MOSS',
    items: [
      'All players must record <b>two demos</b> for every match — one demo per half.',
      'All players must also create a <b>MOSS file</b> for each match. This replaces the need for all screenshots except end-round screenshots.',
    ],
  },
  {
    title: 'Server Selection',
    items: [
      'An <b>International</b> team is any team with at least 3 SA/EU players.',
      'Any match featuring an International team will default to a NY server. An alternate KTP-approved server location may be used if both captains agree.',
      'Any match between two NA teams will default to a Central server.',
      'If a server cannot be agreed upon, draft admins will assign one.',
    ],
  },
]

export default function RulesPage() {
  return (
    <>
      <Topbar items={[{ label: 'Rules & Format', href: '/rules' }]} />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 80px' }}>

        <h1 style={{
          fontFamily: 'var(--font-heading)', fontSize: 40,
          color: 'var(--khaki)', marginBottom: 6,
        }}>
          Rules &amp; Format
        </h1>
        <div style={{
          fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--text-dim)', marginBottom: 40, fontFamily: 'var(--font-body)',
        }}>
          Day of Defeat 1.3 &nbsp;·&nbsp; Draft Events
        </div>

        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: 36 }}>
            <div style={{
              fontSize: 11, fontWeight: 500, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'var(--khaki)',
              borderBottom: '0.5px solid var(--border)',
              paddingBottom: 8, marginBottom: 14,
              fontFamily: 'var(--font-body)',
            }}>
              {section.title}
            </div>

            {'phases' in section && section.phases ? (
              section.phases.map(phase => (
                <div key={phase.label}>
                  <div style={{
                    fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--text-dim)', opacity: 0.5,
                    margin: '14px 0 8px 14px', fontFamily: 'var(--font-body)',
                  }}>
                    {phase.label}
                  </div>
                  {phase.items.map((item, i) => (
                    <RuleItem key={i} text={item} />
                  ))}
                </div>
              ))
            ) : (
              (section.items || []).map((item, i) => (
                <RuleItem key={i} text={item} />
              ))
            )}
          </div>
        ))}
      </div>
    </>
  )
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
        dangerouslySetInnerHTML={{ __html: text.replace(/<b>/g, '<strong style="color:var(--text);font-weight:500">').replace(/<\/b>/g, '</strong>') }}
      />
    </div>
  )
}
