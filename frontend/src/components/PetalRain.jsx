// Canvas2D "petal rain" used as the landing background (pink/purple petals
// drifting down over an obsidian gradient). Ported from the provided design.
//
// Resource-friendly: capped to ~30fps, pauses when the tab is hidden, and is
// disabled entirely when the user prefers reduced motion.

import React, { useEffect, useRef } from 'react'

export default function PetalRain({ active = true }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const runningRef = useRef(false)

  useEffect(() => {
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canvas = canvasRef.current
    if (!canvas || !active || prefersReduced) return
    const ctx = canvas.getContext('2d')

    let petals = []
    const COLORS = ['rgba(241, 91, 181, 0.55)', 'rgba(155, 93, 229, 0.45)']

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      // Density scales gently with screen area, capped to stay light.
      const target = Math.min(60, Math.max(28, Math.floor((canvas.width * canvas.height) / 28000)))
      petals = []
      for (let i = 0; i < target; i++) {
        petals.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 4 + 2.5,
          speedY: Math.random() * 0.7 + 0.4,
          speedX: (Math.random() - 0.5) * 0.4,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.015,
          color: Math.random() > 0.4 ? COLORS[0] : COLORS[1]
        })
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of petals) {
        p.y += p.speedY
        p.x += p.speedX + Math.sin(p.angle) * 0.15 // subtle organic sway
        p.angle += p.spin
        if (p.y > canvas.height + 10) { p.y = -15; p.x = Math.random() * canvas.width }
        if (p.x > canvas.width + 10) p.x = -10
        if (p.x < -10) p.x = canvas.width + 10
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.beginPath()
        ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
        ctx.restore()
      }
    }

    // ~30fps cap: rAF stays vsync-aligned but we skip frames to halve the work.
    const FRAME_MS = 1000 / 30
    let last = 0
    function loop(ts) {
      if (!runningRef.current) return
      rafRef.current = requestAnimationFrame(loop)
      if (ts - last < FRAME_MS) return
      last = ts
      draw()
    }
    function start() { if (runningRef.current) return; runningRef.current = true; rafRef.current = requestAnimationFrame(loop) }
    function stop() { runningRef.current = false; cancelAnimationFrame(rafRef.current) }

    const onVisibility = () => { if (document.visibilityState === 'hidden') stop(); else start() }

    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])

  return <canvas ref={canvasRef} className="petal-rain" aria-hidden="true" />
}
