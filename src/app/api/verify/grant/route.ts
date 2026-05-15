import { NextRequest, NextResponse } from 'next/server'

const DISCORD_BOT_TOKEN      = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID       = process.env.DISCORD_GUILD_ID!
const DISCORD_VERIFIED_ROLE  = process.env.DISCORD_VERIFIED_ROLE_ID!

// POST /api/verify/grant
// Called internally by the callback route after successful Steam verification
// Uses the Discord REST API directly to grant the Verified role
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-bot-secret')
  if (secret !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { discord_id, steam_name } = await req.json()

  if (!discord_id) {
    return NextResponse.json({ error: 'Missing discord_id' }, { status: 400 })
  }

  // Grant the Verified role via Discord REST API
  const grantRes = await fetch(
    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${discord_id}/roles/${DISCORD_VERIFIED_ROLE}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!grantRes.ok && grantRes.status !== 204) {
    const err = await grantRes.json().catch(() => ({}))
    console.error('[verify/grant] Failed to grant role:', grantRes.status, err)
    return NextResponse.json({ error: 'Failed to grant Discord role' }, { status: 500 })
  }

  // DM the user a confirmation
  // First create a DM channel
  const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: discord_id }),
  })

  if (dmRes.ok) {
    const dmChannel = await dmRes.json()
    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `✅ **Verification complete!** Your Steam account **${steam_name ?? ''}** has been linked. You've been granted the **Verified** role — you can now sign up for drafts.\n\nYou can set your Steam profile back to private if you'd like.`,
      }),
    })
  }

  console.log(`[verify/grant] Granted Verified role to Discord user ${discord_id} (Steam: ${steam_name})`)
  return NextResponse.json({ ok: true })
}
