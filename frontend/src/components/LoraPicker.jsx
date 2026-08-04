// Modal to browse and pick a LoRA (with preview image).

import React, { useState } from 'react'

export default function LoraPicker({ loras, current, onPick, onClose }) {
  const [strength, setStrength] = useState(current ? current.strength : 1.0)
  const [selected, setSelected] = useState(current ? current.name : null)

  const confirm = () => {
    if (selected) onPick({ name: selected, strength: Number(strength) })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Pick LoRA</span>
          <button className="icon-btn" onClick={onClose}>x</button>
        </div>

        {loras.length === 0 ? (
          <p className="muted">No LoRAs found in ComfyUI. Make sure they exist in ComfyUI/models/loras/ and click "Refresh Models".</p>
        ) : (
          <div className="lora-grid">
            {loras.map((l) => (
              <button
                key={l.name}
                className={`lora-card ${selected === l.name ? 'active' : ''}`}
                onClick={() => setSelected(l.name)}
              >
                <div className="lora-thumb">
                  {l.preview ? (
                    <img src={l.preview} alt={l.name} />
                  ) : (
                    <span className="lora-noprev">no preview</span>
                  )}
                </div>
                <div className="lora-name">{l.name}</div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 16 }}>
            <label className="field-label">Strength: {Number(strength).toFixed(2)}</label>
            <input
              type="range" min="0" max="1.5" step="0.05"
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        )}

        <div className="row-between" style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!selected} onClick={confirm}>Use LoRA</button>
        </div>
      </div>
    </div>
  )
}
