'use client'

import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function LandingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (status === 'authenticated') {
      const isAdmin = session?.user?.isOrganizer || session?.user?.isSuperUser
      router.push(isAdmin ? '/dashboard' : '/portal')
    }
  }, [session, status, router])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const GRID = 28, REACH = 110, OFF = GRID / 2
    const DR = 126, DG = 170, DB = 200
    let mx = -9999, my = -9999, raf: number

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (mx >= 0) {
        const x0 = Math.floor((mx - REACH - OFF) / GRID) * GRID + OFF
        const y0 = Math.floor((my - REACH - OFF) / GRID) * GRID + OFF
        const x1 = Math.ceil((mx + REACH - OFF) / GRID) * GRID + OFF
        const y1 = Math.ceil((my + REACH - OFF) / GRID) * GRID + OFF
        for (let dx = x0; dx <= x1; dx += GRID) {
          for (let dy = y0; dy <= y1; dy += GRID) {
            const dist = Math.hypot(dx - mx, dy - my)
            if (dist > REACH) continue
            const t = 1 - dist / REACH
            const ease = t * t * (3 - 2 * t)
            const alpha = ease * 0.65
            const ds = 0.8 + ease * 1.1
            const halo = ctx.createRadialGradient(dx, dy, 0, dx, dy, ds * 6)
            halo.addColorStop(0, `rgba(${DR},${DG},${DB},${(ease * 0.22).toFixed(3)})`)
            halo.addColorStop(1, `rgba(${DR},${DG},${DB},0)`)
            ctx.beginPath(); ctx.arc(dx, dy, ds * 6, 0, Math.PI * 2)
            ctx.fillStyle = halo; ctx.fill()
            ctx.beginPath(); ctx.arc(dx, dy, ds, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${DR},${DG},${DB},${Math.min(alpha, 1).toFixed(3)})`
            ctx.fill()
          }
        }
      }
      raf = requestAnimationFrame(draw)
    }

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY }
    const onLeave = () => { mx = -9999; my = -9999 }

    window.addEventListener('resize', resize)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    resize(); draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <>
    <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 24px',
      position: 'relative',
      zIndex: 1,
    }}>
      <style>{`
        @keyframes lp-up { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes lp-pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.4;transform:scale(.65);} }
        .lp-animate { opacity:0; animation: lp-up .55s ease forwards; }
        @media (max-width: 600px) {
          .lp-title { font-size: 40px !important; }
          .lp-cards { flex-direction: column !important; }
          .lp-cards > div { flex: unset !important; width: 100% !important; }
        }
        .lp-discord-btn { transition: transform .12s ease, box-shadow .15s ease; }
        .lp-discord-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(88,101,242,0.45); }
        .lp-discord-btn:active { transform: translateY(1px); box-shadow: none; }
        .lp-card { transition: border-color .2s, transform .2s, box-shadow .2s; position: relative; overflow: hidden; }
        .lp-card::before { content:''; position:absolute; width:180px; height:180px; border-radius:50%; background:radial-gradient(circle,rgba(200,184,122,0.07) 0%,transparent 70%); pointer-events:none; transform:translate(-50%,-50%); opacity:0; transition:opacity .3s; left:var(--cx,50%); top:var(--cy,50%); }
        .lp-card:hover { border-color: rgba(200,184,122,0.35) !important; transform:translateY(-3px); box-shadow:0 8px 28px rgba(0,0,0,0.5); }
        .lp-card:hover::before { opacity:1; }
      `}</style>

      {/* Pill */}
      <div className="lp-animate" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: '1px solid var(--border-strong)',
        borderRadius: 20,
        padding: '4px 14px',
        marginBottom: 32,
        fontSize: 11,
        color: 'var(--text-dim)',
        letterSpacing: '0.08em',
        animationDelay: '0s',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--khaki)', display: 'inline-block', animation: 'lp-pulse 2.4s ease-in-out infinite' }} />
        Day of Defeat 1.3 · Community Platform
      </div>

      {/* Icon */}
      <div className="lp-animate" style={{ marginBottom: 24, animationDelay: '0.08s' }}>
        <Image
          src="/icon.png"
          alt="DRAFT MAN"
          width={120}
          height={120}
          style={{ borderRadius: '50%', objectFit: 'cover' }}
        />
      </div>

      {/* Title */}
      <div className="lp-animate lp-title" style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 64,
        letterSpacing: '0.06em',
        background: 'linear-gradient(135deg, #a08848 0%, #c8b87a 35%, #ede0a8 55%, #c8b87a 75%, #a08848 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        filter: 'drop-shadow(0 0 3px rgba(200,184,122,0.55)) drop-shadow(0 0 8px rgba(200,184,122,0.2))',
        lineHeight: 1,
        marginBottom: 10,
        animationDelay: '0.15s',
      }}>
        DRAFTMAN5.0
      </div>

      {/* Subtitle */}
      <div className="lp-animate" style={{
        fontSize: 11,
        letterSpacing: '0.2em',
        color: 'var(--text-dim)',
        marginBottom: 28,
        fontFamily: 'var(--font-body)',
        animationDelay: '0.22s',
      }}>
        COMMUNITY EVENT PLATFORM
      </div>

      {/* Description */}
      <p className="lp-animate" style={{
        fontSize: 13,
        color: 'var(--text-dim)',
        lineHeight: 1.8,
        textAlign: 'center',
        maxWidth: 420,
        marginBottom: 32,
        fontFamily: 'var(--font-body)',
        animationDelay: '0.28s',
      }}>
        Sign up for drafts and community events, check in before matches, and join the draft board — all connected to your{' '}
        <span style={{ color: 'var(--text)', textDecoration: 'underline' }}>Discord account.</span>
      </p>

      {/* Discord button */}
      <button
        onClick={() => signIn('discord', { callbackUrl: '/dashboard' })}
        className="lp-animate lp-discord-btn"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: '#5865F2',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '12px 28px',
          fontSize: 14,
          fontFamily: 'var(--font-body)',
          cursor: 'pointer',
          letterSpacing: '0.04em',
          marginBottom: 12,
          boxShadow: '0 4px 24px rgba(88,101,242,0.25)',
          animationDelay: '0.34s',
        }}
      >
        <svg width="20" height="15" viewBox="0 0 71 55" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6530 45.2082C54.7817 45.304 54.7733 45.5041 54.6306 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" />
        </svg>
        Login with Discord
      </button>

      {/* Privacy note */}
      <div className="lp-animate" style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 48, fontFamily: 'var(--font-body)', animationDelay: '0.38s' }}>
        We only request your username and avatar. No passwords stored.
      </div>

      {/* Feature cards */}
      <div className="lp-cards lp-animate" style={{ display: 'flex', gap: 12, marginBottom: 48, width: '100%', maxWidth: 560, animationDelay: '0.44s' }}>
        {[
          {
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
            title: 'Draft Signups',
            desc: 'Sign up by class, check in before the draft, get picked by captains.',
          },
          {
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
            title: 'Auto Reminders',
            desc: 'Discord DMs before every event. Never miss a check-in window.',
          },
          {
            icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
            title: 'Live Board',
            desc: 'Watch the signup sheet and draft board update in real time.',
          },
        ].map((card) => (
          <div
            key={card.title}
            className="lp-card"
            style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '16px 14px' }}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              e.currentTarget.style.setProperty('--cx', (e.clientX - r.left) + 'px')
              e.currentTarget.style.setProperty('--cy', (e.clientY - r.top) + 'px')
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.setProperty('--cx', '50%')
              e.currentTarget.style.setProperty('--cy', '50%')
            }}
          >
            <div style={{ color: 'var(--khaki)', marginBottom: 8, opacity: 0.7 }}>{card.icon}</div>
            <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)', marginBottom: 6, fontWeight: 600 }}>
              {card.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
              {card.desc}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="lp-animate" style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 2, fontFamily: 'var(--font-body)', animationDelay: '0.5s' }}>
        DRAFT MAN 5.0 · Day of Defeat 1.3
        <br />
        <Link href="/rules" style={{ color: 'var(--khaki)', textDecoration: 'underline', fontSize: 11 }}>
          View Rules &amp; Format
        </Link>
      </div>

    </div>
    </>
  )
}
