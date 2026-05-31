'use client';

import { useEffect, useRef } from 'react';

export function ReactiveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SPACING = 32, DOT_R = 1.1, INFLUENCE = 100, PUSH = 26;
    type Dot = { ox: number; oy: number; x: number; y: number };
    let dots: Dot[] = [];
    let mx = -999, my = -999, animId = 0;

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
        const alpha = inRange ? 0.08 + (1 - dist / INFLUENCE) * 0.2 : 0.08;
        cx.beginPath();
        cx.arc(d.x, d.y, DOT_R, 0, Math.PI * 2);
        cx.fillStyle = `rgba(67,206,162,${alpha})`;
        cx.fill();
      }
      animId = requestAnimationFrame(draw);
    }

    build();
    draw();

    const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', build);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', build);
    };
  }, []);

  return (
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
  );
}
