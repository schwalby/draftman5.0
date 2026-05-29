import { Topbar } from '@/components/Topbar'

export default function DisclaimerPage() {
  return (
    <>
      <Topbar />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>

        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 9, letterSpacing: '0.18em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8 }}>
          Legal
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 300, fontSize: 32, letterSpacing: '0.04em', color: 'var(--text)', marginBottom: 8 }}>
          Privacy &amp; Data
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted, #5a5444)', marginBottom: 40 }}>
          Last updated: May 2026
        </p>

        {[
          {
            heading: 'What we collect',
            body: 'When you verify your Steam account, we store your Steam display name, Steam avatar image, Steam ID (in both STEAM_0:X:Y and 64-bit formats), and a flag indicating you have been verified. We also temporarily check your account creation date and game library to confirm eligibility — this information is not stored.',
          },
          {
            heading: 'What we do not collect',
            body: 'We do not collect or store passwords, email addresses, payment information, real names, location data, friends lists, playtime, or any other personal information beyond what is listed above.',
          },
          {
            heading: 'How it is used',
            body: 'Your Steam display name and avatar are shown on draft boards and team pages within this platform. Your Steam ID is used to link your account for event participation. No data is sold, shared with third parties, or used for advertising.',
          },
          {
            heading: 'Discord data',
            body: 'We store your Discord username and a Discord user ID to identify your account within the platform. This is provided at login via Discord OAuth and is not shared externally.',
          },
          {
            heading: 'Data retention',
            body: 'Your account data is retained for as long as your account is active on the platform. You can request deletion by contacting a moderator in Discord.',
          },
          {
            heading: 'Contact',
            body: 'Questions or requests regarding your data? Reach out to a moderator in the Day of Defeat 1.3 Discord server.',
          },
        ].map(section => (
          <div key={section.heading} style={{ marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14, letterSpacing: '0.12em', color: 'var(--khaki)', textTransform: 'uppercase', marginBottom: 10 }}>
              {section.heading}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.8, fontFamily: 'var(--font-body)' }}>
              {section.body}
            </p>
          </div>
        ))}

      </main>
    </>
  )
}
