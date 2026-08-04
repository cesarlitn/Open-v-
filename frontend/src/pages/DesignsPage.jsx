// "Models" page. Hosts the tabbed tools: Compose, Find & Replace, Replicate and
// Upscale.

import React, { useState, useEffect } from 'react'
import PosesTab from '../components/PosesTab'
import FindReplaceTab from '../components/FindReplaceTab'
import ReplicateTab from '../components/ReplicateTab'
import UpscaleTab from '../components/UpscaleTab'

const TABS = [
  { id: 'poses', label: 'Compose' },
  { id: 'replace', label: 'Find & Replace' },
  { id: 'replicate', label: 'Replicate' },
  { id: 'upscale', label: 'Upscale' }
]

export default function DesignsPage({ onBack, onSendToGenerate, active = true, fitContain = false }) {
  const [activeTab, setActiveTab] = useState('poses')

  // ESC inside Models -> back to Generate (only while this view is active).
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
      if (document.querySelector('.modal-overlay')) return
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onBack])

  return (
    <div className="app app-wide">
      <div className="app-header">
        <button className="btn btn-ghost" onClick={onBack}>{'<- Back'}</button>
      </div>

      <div className="designs-page">
        <div className="designs-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`designs-tab ${activeTab === t.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'poses' && <PosesTab onSendToGenerate={onSendToGenerate} fitContain={fitContain} />}
        {activeTab === 'replace' && <FindReplaceTab onSendToGenerate={onSendToGenerate} fitContain={fitContain} />}
        {activeTab === 'replicate' && <ReplicateTab onSendToGenerate={onSendToGenerate} />}
        {activeTab === 'upscale' && <UpscaleTab />}
      </div>
    </div>
  )
}
