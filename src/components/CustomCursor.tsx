'use client'

import { useEffect, useRef } from 'react'

export function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dot  = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    let mx = 0, my = 0, rx = 0, ry = 0, raf: number

    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY
      dot.style.left = mx + 'px'
      dot.style.top  = my + 'px'
    }

    const animRing = () => {
      rx += (mx - rx) * 0.12
      ry += (my - ry) * 0.12
      ring.style.left = rx + 'px'
      ring.style.top  = ry + 'px'
      raf = requestAnimationFrame(animRing)
    }

    const addHover = () => document.body.classList.add('cursor-hovering')
    const rmHover  = () => document.body.classList.remove('cursor-hovering')

    const bindHover = () => {
      document.querySelectorAll('button, a, [role="button"], input, select, textarea, .ev-row, .db-event-card, .card')
        .forEach(el => {
          el.addEventListener('mouseenter', addHover)
          el.addEventListener('mouseleave', rmHover)
        })
    }

    document.addEventListener('mousemove', onMove)
    // re-bind hover targets after navigation / hydration
    const observer = new MutationObserver(bindHover)
    observer.observe(document.body, { childList: true, subtree: true })
    bindHover()
    animRing()

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      observer.disconnect()
    }
  }, [])

  return (
    <>
      <style>{`
        @media (pointer: fine) {
          body { cursor: none !important; }
          body * { cursor: none !important; }
        }
        #dm-cursor {
          position: fixed; width: 8px; height: 8px; border-radius: 50%;
          background: var(--khaki); pointer-events: none; z-index: 9999;
          transform: translate(-50%, -50%);
          transition: width .15s, height .15s, background .2s;
        }
        #dm-cursor-ring {
          position: fixed; width: 32px; height: 32px;
          border: 1px solid rgba(200,184,122,0.4); border-radius: 50%;
          pointer-events: none; z-index: 9998;
          transform: translate(-50%, -50%);
          transition: width .2s, height .2s, border-color .2s;
        }
        body.cursor-hovering #dm-cursor { width: 12px; height: 12px; background: #e53935; }
        body.cursor-hovering #dm-cursor-ring { width: 44px; height: 44px; border-color: rgba(229,57,53,0.4); }
      `}</style>
      <div id="dm-cursor"      ref={dotRef}  />
      <div id="dm-cursor-ring" ref={ringRef} />
    </>
  )
}
