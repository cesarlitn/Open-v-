// Modal grid for choosing the output resolution / aspect ratio.

import React from 'react'
import { RESOLUTIONS } from '../resolutions'

export default function ResolutionPicker({ current, onPick, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Resolution</span>
          <button className="icon-btn" onClick={onClose}>x</button>
        </div>
        <div className="res-grid">
          {RESOLUTIONS.map((r) => {
            const active = current && current.w === r.w && current.h === r.h
            const longSide = 60
            const sw = r.w >= r.h ? longSide : Math.round((r.w / r.h) * longSide)
            const sh = r.h >= r.w ? longSide : Math.round((r.h / r.w) * longSide)
            return (
              <button
                key={`${r.w}x${r.h}`}
                className={`res-card ${active ? 'active' : ''}`}
                onClick={() => { onPick(r); onClose() }}
              >
                <div className="res-shape" style={{ width: sw, height: sh }} />
                <div className="res-dim">{r.w} x {r.h}</div>
                <div className="res-label">{r.label} - {r.ratio}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
