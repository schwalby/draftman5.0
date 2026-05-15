'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

// Error code → { title, message, actionable hint }
const ERROR_STATES: Record<string, { title: string; message: string; hint?: string }> = {
  missing_token: {
    title: 'Invalid link',
    message: 'This verification link is missing a token. Please run /verify in Discord to get a new one.',
  },
  invalid_token: {
    title: 'Link expired or already used',
    message: 'This verification link has already been used or is no longer valid.',
    hint: 'Run /verify in Discord to generate a fresh link.',
  },
  expired_token: {
    title: 'Link expired',
    message: 'This verification link has expired (links are valid for 15 minutes).',
    hint: 'Run /verify in Discord to generate a fresh link.',
  },
  steam_cancelled: {
    title: 'Steam login cancelled',
    message: 'You cancelled the Steam login. Run /verify in Discord to try again.',
  },
  steam_invalid: {
    title: 'Steam verification failed',
    message: 'We could not validate your Steam login. Please try again.',
    hint: 'Run /verify in Discord to generate a fresh link.',
  },
  steam_id_parse: {
    title: 'Steam ID error',
    message: 'We could not read your Steam ID. Please try again.',
  },
  steam_profile_not_found: {
    title: 'Steam profile not found',
    message: 'We could not find your Steam profile. Make sure your profile is set to public and try again.',
  },
  private: {
    title: 'Steam profile is private',
    message: 'Your Steam profile is set to private. We need it to be public to verify your library.',
    hint: 'Set your profile to public in Steam → Settings → Privacy, then run /verify again. You can set it back to private as soon as verification is done.',
  },
  too_new: {
    title: 'Account too new',
    message: 'Your Steam account must be at least 30 days old.',
    hint: 'If you believe this is an error, reach out to a moderator in Discord.',
  },
  no_dod: {
    title: 'Day of Defeat not found',
    message: 'Day of Defeat (1.3) was not found in your Steam library. You must own the game to participate.',
    hint: 'Pick it up on Steam for $4.99. Once added, run /verify in Discord again.',
  },
  db_error: {
    title: 'Something went wrong',
    message: 'We could not save your verification. Please try again or contact a moderator.',
  },
}

function VerifyContent() {
  const params = useSearchParams()
  const token   = params.get('token')
  const success = params.get('success')
  const error   = params.get('error')
  const daysLeft = params.get('days_left')

  // ── Success state ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="verify-state verify-success">
        <div className="verify-state-icon">✓</div>
        <div className="verify-state-title">Verification complete</div>
        <p className="verify-state-msg">
          Your Steam account has been linked.<br />
          Check Discord — you&apos;ve been granted the <strong>Verified</strong> role.<br /><br />
          You can set your Steam profile back to private now, and close this tab.
        </p>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    const state = ERROR_STATES[error] ?? {
      title: 'Something went wrong',
      message: 'An unexpected error occurred. Please try again.',
    }

    // Append days remaining for too_new error
    const message = error === 'too_new' && daysLeft
      ? `${state.message} Your account needs ${daysLeft} more day${daysLeft === '1' ? '' : 's'}.`
      : state.message

    return (
      <div className="verify-state verify-error">
        <div className="verify-fail-msg">{message}</div>
        {state.hint && <p className="verify-state-msg">{state.hint}</p>}
      </div>
    )
  }

  // ── Default state — show the verify prompt ─────────────────────────────────
  // Extract discord username from token metadata via a lightweight fetch
  // We pass the token to the Steam initiation route
  const steamLoginUrl = token
    ? `/api/verify/steam?token=${token}`
    : null

  return (
    <div className="verify-body">
      <div className="verify-checks">
        <div className="verify-checks-label">Requirements</div>
        <div className="verify-check-row">
          <div className="verify-dot" />
          Steam account at least 30 days old
        </div>
        <div className="verify-check-row">
          <div className="verify-dot" />
          Owns Day of Defeat (App ID 30)
        </div>
        <div className="verify-check-row">
          <div className="verify-dot" />
          Steam profile set to public
        </div>
      </div>

      <div className="verify-notice">
        <strong>Privacy note:</strong> Your profile only needs to be public during verification.
        Once done, you can set it back to private or friends-only.
      </div>

      {steamLoginUrl ? (
        <a href={steamLoginUrl} className="verify-btn">
          <SteamIcon />
          Login with Steam
        </a>
      ) : (
        <div className="verify-fail-msg">
          No verification token found. Run <strong>/verify</strong> in Discord to get a link.
        </div>
      )}

      <div className="verify-footer">
        Questions? Ask a moderator in Discord.
      </div>
    </div>
  )
}

function SteamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#c7d5e0" aria-hidden>
      <path d="M11.979 0C5.678 0 .511 4.86.511 10.845c0 2.96 1.309 5.792 3.581 7.77l.013 2.76c0 .304.365.476.613.297l2.853-1.966c1.22.393 2.537.607 3.408.607 6.301 0 11.469-4.86 11.469-10.845C23.448 4.86 18.28 0 11.979 0zm-.687 14.586l-2.976-3.165 5.689-3.345-3.03 3.281 3.004 3.146-5.776 3.407 3.089-3.324z" />
    </svg>
  )
}

export default function VerifyPage() {
  return (
    <>
      <style>{`
        .verify-wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          background: var(--color-background-primary);
        }
        .verify-card {
          background: var(--color-background-primary);
          border: 0.5px solid var(--color-border-secondary);
          border-radius: var(--border-radius-lg);
          max-width: 420px;
          width: 100%;
          overflow: hidden;
        }
        .verify-header {
          background: #1a1a14;
          padding: 1.5rem 1.75rem 1.25rem;
          border-bottom: 2px solid var(--color-accent-gold);
        }
        .verify-logo {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--color-accent-gold);
          letter-spacing: 0.15em;
          margin-bottom: 0.75rem;
          opacity: 0.8;
        }
        .verify-title {
          font-family: var(--font-mono);
          font-size: 22px;
          color: #f0e8c8;
          margin: 0 0 0.25rem;
          letter-spacing: 0.05em;
        }
        .verify-subtitle {
          font-size: 13px;
          color: var(--color-text-secondary);
          margin: 0;
        }
        .verify-body {
          padding: 1.5rem 1.75rem;
        }
        .verify-checks {
          margin-bottom: 1rem;
        }
        .verify-checks-label {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          color: var(--color-text-secondary);
          text-transform: uppercase;
          margin-bottom: 0.5rem;
        }
        .verify-check-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.4rem 0;
          font-size: 13px;
          color: var(--color-text-secondary);
          border-bottom: 0.5px solid var(--color-border-tertiary);
        }
        .verify-check-row:last-child { border-bottom: none; }
        .verify-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-border-secondary);
          flex-shrink: 0;
        }
        .verify-notice {
          font-size: 12px;
          color: var(--color-text-secondary);
          background: var(--color-background-secondary);
          border: 0.5px solid var(--color-border-tertiary);
          border-radius: var(--border-radius-md);
          padding: 0.6rem 0.875rem;
          margin-bottom: 1.25rem;
          line-height: 1.5;
        }
        .verify-notice strong { color: var(--color-text-primary); font-weight: 500; }
        .verify-btn {
          width: 100%;
          padding: 0.75rem;
          background: #1b2838;
          color: #c7d5e0;
          border: none;
          border-radius: var(--border-radius-md);
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 0.75rem;
          text-decoration: none;
          transition: background 0.15s;
        }
        .verify-btn:hover { background: #2a475e; }
        .verify-footer {
          font-size: 11px;
          color: var(--color-text-secondary);
          text-align: center;
          line-height: 1.5;
        }
        .verify-state {
          padding: 2rem 1.75rem;
          text-align: center;
        }
        .verify-state-icon {
          font-size: 36px;
          margin-bottom: 0.75rem;
          color: var(--color-accent-gold);
        }
        .verify-state-title {
          font-family: var(--font-mono);
          font-size: 18px;
          color: var(--color-text-primary);
          margin-bottom: 0.75rem;
        }
        .verify-state-msg {
          font-size: 13px;
          color: var(--color-text-secondary);
          line-height: 1.7;
          margin: 0;
        }
        .verify-fail-msg {
          background: var(--color-background-danger, #2a1010);
          border: 0.5px solid var(--color-border-danger, #6b2020);
          border-radius: var(--border-radius-md);
          padding: 0.75rem 1rem;
          font-size: 13px;
          color: var(--color-text-danger, #e07070);
          margin-bottom: 1rem;
          text-align: left;
        }
        .verify-error {
          padding: 1.5rem 1.75rem;
          text-align: left;
        }
      `}</style>

      <div className="verify-wrap">
        <div className="verify-card">
          <div className="verify-header">
            <div className="verify-logo">DRAFT MAN 5.0 · STEAM VERIFICATION</div>
            <div className="verify-title">Verify your account</div>
            <div className="verify-subtitle">Link your Steam account to participate in drafts</div>
          </div>

          <Suspense fallback={<div className="verify-body" style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Loading…</div>}>
            <VerifyContent />
          </Suspense>
        </div>
      </div>
    </>
  )
}
