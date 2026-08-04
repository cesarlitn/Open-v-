// Landing screen. Obsidian sky with soft falling petals; a discreet handle on the
// right expands the glass navigation menu. No central text/logo.

import React, { useState } from 'react'
import PetalRain from '../components/PetalRain'

// Obsidian radial background (matches the petal ambience).
const OBSIDIAN = 'radial-gradient(circle at center, #0c0a12 0%, #040306 100%)'

export default function Landing({ onNavigate }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="landing" style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: OBSIDIAN }}>
      <PetalRain active />

      {/* hover zone on the right edge reveals the menu */}
      <div className="landing-hot" onMouseEnter={() => setOpen(true)} />

      <button
        type="button"
        className={`landing-handle ${open ? 'hidden' : ''}`}
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <span /><span /><span />
      </button>

      <nav
        className={`landing-menu ${open ? 'open' : ''}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Main menu"
      >
        <button type="button" className="glass-item" onClick={() => onNavigate('generate')}>GENERAR</button>
        <button type="button" className="glass-item" onClick={() => onNavigate('designs')}>MODEL</button>
        <button type="button" className="glass-item" onClick={() => onNavigate('settings')}>SETTINGS</button>
      </nav>
    </div>
  )
}
