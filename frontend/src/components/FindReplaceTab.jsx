// "Find & Replace" tab: pick an image, edit/replace its tags, send to Generate.

import React, { useState, useEffect } from 'react'
import api from '../services/api'

const CHIPS = [
  { label: 'Character', find: 'cesar', replace: 'pedro' },
  { label: 'Setting', find: 'forest', replace: 'city' },
  { label: 'Hair', find: 'black hair', replace: 'blonde hair' },
  { label: 'Outfit', find: 'school uniform', replace: 'casual clothes' },
  { label: 'Expression', find: 'smile', replace: 'serious' }
]

function applyPairs(text, pairs) {
  let out = text || ''
  for (const p of pairs) {
    if (!p.find) continue
    const esc = p.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(esc, 'gi'), p.replace || '')
  }
  return out
}

export default function FindReplaceTab({ onSendToGenerate, fitContain = false }) {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [pairs, setPairs] = useState([{ find: '', replace: '' }])

  const load = async (s = '') => {
    try {
      const data = await api.history({ search: s, page: 1, limit: 24 })
      setItems(data.items || [])
    } catch { setItems([]) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { const t = setTimeout(() => load(search), 250); return () => clearTimeout(t) }, [search])

  const setPair = (i, key, val) => setPairs((p) => p.map((x, idx) => (idx === i ? { ...x, [key]: val } : x)))
  const addPair = () => setPairs((p) => [...p, { find: '', replace: '' }])
  const removePair = (i) => setPairs((p) => p.filter((_, idx) => idx !== i))
  const addChip = (c) => setPairs((p) => {
    const empty = p.findIndex((x) => !x.find && !x.replace)
    const next = { find: c.find, replace: c.replace }
    if (empty >= 0) return p.map((x, idx) => (idx === empty ? next : x))
    return [...p, next]
  })

  const previewPos = selected ? applyPairs(selected.positive, pairs) : ''
  const previewNeg = selected ? applyPairs(selected.negative, pairs) : ''

  const apply = () => {
    if (!selected) return
    onSendToGenerate({ positive: previewPos, negative: previewNeg })
  }

  return (
    <div className="designs-2col">
      <div className="panel">
        <input className="input" placeholder="Search images..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="history-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {items.map((it) => (
            <div
              key={it.id}
              className={`thumb ${fitContain ? 'contain' : 'cover'} ${selected && selected.id === it.id ? 'selected' : ''}`}
              style={selected && selected.id === it.id ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 2px rgba(var(--brand-rgb),0.4)' } : {}}
              onClick={() => setSelected(it)}
            >
              <img src={it.thumbnail} alt="" loading="lazy" decoding="async" />
            </div>
          ))}
        </div>
      </div>

      <div className="panel stack">
        <div>
          <span className="section-title">Quick chips</span>
          <div className="chips" style={{ marginTop: 8 }}>
            {CHIPS.map((c) => <button key={c.label} className="chip" onClick={() => addChip(c)}>{c.label}</button>)}
          </div>
        </div>

        <div>
          <span className="section-title">Find / Replace pairs</span>
          <div style={{ marginTop: 8 }}>
            {pairs.map((p, i) => (
              <div className="pair-row" key={i}>
                <input className="input" placeholder="find" value={p.find} onChange={(e) => setPair(i, 'find', e.target.value)} />
                <span className="pair-arrow">-></span>
                <input className="input" placeholder="replace" value={p.replace} onChange={(e) => setPair(i, 'replace', e.target.value)} />
                <button className="icon-btn" onClick={() => removePair(i)}>x</button>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={addPair}>+ Add another pair</button>
          </div>
        </div>

        <div>
          <label className="field-label" style={{ color: 'var(--green)' }}>Positive preview</label>
          <div className="raw-panel">{selected ? (previewPos || '-') : 'Select an image on the left.'}</div>
        </div>
        <div>
          <label className="field-label" style={{ color: 'var(--red)' }}>Negative preview</label>
          <div className="raw-panel">{selected ? (previewNeg || '-') : '-'}</div>
        </div>

        <button className="btn btn-primary btn-block" disabled={!selected} onClick={apply}>Apply &amp; Send to Generate -></button>
      </div>
    </div>
  )
}
