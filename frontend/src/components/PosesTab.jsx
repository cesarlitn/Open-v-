// "Compose" tab: extract tags from an image (WD14) and split them into character
// vs outfit/pose/scene; includes the character and pose libraries.

import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'
import SaveModal from './SaveModal'

const PRESET_KEY = 'posePresets'
const loadPresets = () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]') } catch { return [] } }
const savePresets = (l) => { try { localStorage.setItem(PRESET_KEY, JSON.stringify(l)) } catch { /* ignore */ } }

const DEFAULT_NEG =
  'lowres, worst quality, low quality, normal quality, jpeg artifacts, blurry, ' +
  'bad anatomy, bad hands, bad proportions, missing fingers, extra fingers, ' +
  'extra digits, fewer digits, mutated hands, deformed, disfigured, ugly, ' +
  'signature, watermark, username, text, logo, cropped, out of frame, ' +
  'duplicate, error, jpeg artifacts'

function characterDesc(c) {
  return [c.target_profile, c.hair, c.eyes, c.species_traits, c.clothing, c.accessories]
    .filter((x) => x && x.trim()).join(', ')
}
function dedupJoin(...parts) {
  const seen = new Set(); const out = []
  for (const part of parts) {
    for (const t of String(part || '').split(',')) {
      const k = t.trim(); const lk = k.toLowerCase()
      if (!k || seen.has(lk)) continue
      seen.add(lk); out.push(k)
    }
  }
  return out.join(', ')
}

export default function PosesTab({ onSendToGenerate, fitContain = false }) {
  // left: source + boxes
  const [image, setImage] = useState(null)
  const [drag, setDrag] = useState(false)
  const [tagging, setTagging] = useState(false)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const [charDesc, setCharDesc] = useState('')
  const [outfitTags, setOutfitTags] = useState('')
  const [filterInfo, setFilterInfo] = useState('')

  // libraries
  const [characters, setCharacters] = useState([])
  const [charSearch, setCharSearch] = useState('')
  const [activeCharId, setActiveCharId] = useState(null)
  const [poses, setPoses] = useState([])
  const [poseSearch, setPoseSearch] = useState('')
  const [activePoseId, setActivePoseId] = useState(null)

  // save modal
  const [save, setSave] = useState(null) // { kind, editId, initialTag, initialName, initialPreview }

  // llm mirror
  const [llmOptions, setLlmOptions] = useState([])
  const [llmSel, setLlmSel] = useState('')

  // result
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState(DEFAULT_NEG)
  const [error, setError] = useState('')
  const [presets, setPresets] = useState(loadPresets())

  const loadChars = useCallback(async (s = '') => {
    try { const d = await api.characters(s); setCharacters(d.items || []); return d.items || [] } catch { setCharacters([]); return [] }
  }, [])
  const loadPoses = useCallback(async (s = '') => {
    try { const d = await api.poses(s); setPoses(d.items || []); return d.items || [] } catch { setPoses([]); return [] }
  }, [])
  const loadLlm = useCallback(async () => {
    try {
      const d = await api.llmModels()
      const opts = [...(d.items || []).map((m) => ({ id: m.id, label: m.label }))]
      if (d.apiKeySet) {
        for (const c of (d.cloud || [])) for (const m of c.models) opts.push({ id: `${c.id}::${m}`, label: `${m}  -  ${c.label}` })
      }
      if (d.selected && !opts.some((o) => o.id === d.selected)) opts.push({ id: d.selected, label: `${d.selected.split('::')[1]}  -  (configured)` })
      setLlmOptions(opts)
      setLlmSel(d.selected || '')
    } catch { setLlmOptions([]) }
  }, [])

  useEffect(() => { loadChars(); loadPoses(); loadLlm() }, [loadChars, loadPoses, loadLlm])
  useEffect(() => { const t = setTimeout(() => loadChars(charSearch), 220); return () => clearTimeout(t) }, [charSearch, loadChars])
  useEffect(() => { const t = setTimeout(() => loadPoses(poseSearch), 220); return () => clearTimeout(t) }, [poseSearch, loadPoses])

  const changeLlm = async (id) => {
    setLlmSel(id)
    const [provider, model] = id ? id.split('::') : ['', '']
    try { await api.setSettings({ llmProvider: provider, llmModel: model }) } catch { /* ignore */ }
  }

  const readFile = (file) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { setError('Image too large (max 25 MB).'); return }
    setError('')
    const r = new FileReader(); r.onload = () => setImage(r.result); r.readAsDataURL(file)
  }

  const extractTags = async () => {
    if (!image) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setTagging(true); setError(''); setFilterInfo('')
    try {
      const r = await api.tag({ image }, { signal: ctrl.signal })
      const tags = r.tags || ''
      try {
        const f = await api.splitTags({ tags }, { signal: ctrl.signal })
        setCharDesc(f.character || tags)
        setOutfitTags(f.outfit || '')
        setFilterInfo(f.viaLlm ? 'Split by AI (character / outfit-pose-scene)' : 'Split by rules (no AI model selected)')
      } catch (e) { if (e.name !== 'AbortError') { setCharDesc(tags); setOutfitTags(''); setFilterInfo('Tags loaded (split skipped)') } }
      setActiveCharId(null)
    } catch (err) {
      if (err.name === 'AbortError') setFilterInfo('Extraction cancelled')
      else setError(err.message)
    } finally { setTagging(false); abortRef.current = null }
  }
  const cancelExtract = () => { if (abortRef.current) abortRef.current.abort() }

  const pickCharacter = (c) => { setActiveCharId(c.id); setCharDesc(characterDesc(c)) }

  const applyPose = (p) => {
    if (!charDesc.trim()) { setError('Pick or extract a character first.'); return }
    setActivePoseId(p.id)
    setPositive(dedupJoin(charDesc, p.prompt, 'masterpiece, best quality, highly detailed, absurdres'))
    setError('')
  }

  const delChar = async (id) => { if (!window.confirm('Delete this character?')) return; await api.deleteCharacter(id); loadChars(charSearch); if (activeCharId === id) setActiveCharId(null) }
  const delPose = async (id) => { if (!window.confirm('Delete this pose?')) return; await api.deletePose(id); loadPoses(poseSearch); if (activePoseId === id) setActivePoseId(null) }

  const savePreset = () => {
    if (!positive) return
    const name = window.prompt('Preset name?'); if (!name) return
    const next = [{ name, positive, negative, ts: Date.now() }, ...presets].slice(0, 50)
    setPresets(next); savePresets(next)
  }
  const loadPreset = (e) => { const i = e.target.value; if (i === '') return; const p = presets[Number(i)]; if (p) { setPositive(p.positive); setNegative(p.negative) } }

  const afterSave = () => { loadChars(charSearch); loadPoses(poseSearch) }

  return (
    <div className="poses-4col">
      {/* LEFT: characters */}
      <div className="panel stack">
        <div className="section-title">Character</div>
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onClick={() => inputRef.current && inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files && e.dataTransfer.files[0]) }}
        >
          {image ? <img src={image} alt="source" /> : <div>Drag a character image<br />or click to browse</div>}
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => readFile(e.target.files && e.target.files[0])} />
        </div>
        {tagging ? (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled>Extracting...</button>
            <button className="btn btn-danger" onClick={cancelExtract}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn-primary btn-block" disabled={!image} onClick={extractTags}>Extract Tags</button>
        )}

        <div>
          <div className="field-head">
            <label className="field-label">Character &amp; description</label>
            <button className="save-link" disabled={!charDesc.trim()} onClick={() => setSave({ kind: 'character', initialTag: charDesc })}>save</button>
          </div>
          <textarea className="textarea" style={{ minHeight: 84 }} value={charDesc} onChange={(e) => { setCharDesc(e.target.value); setActiveCharId(null) }} />
        </div>
        <div>
          <div className="field-head">
            <label className="field-label">Clothing - accessories - pose - scene</label>
            <button className="save-link" disabled={!outfitTags.trim()} onClick={() => setSave({ kind: 'pose', initialTag: outfitTags })}>save</button>
          </div>
          <textarea className="textarea" style={{ minHeight: 76 }} value={outfitTags} onChange={(e) => setOutfitTags(e.target.value)} />
        </div>
        {filterInfo && <div className="muted">{filterInfo}</div>}

        <div className="char-lib-head" style={{ marginTop: 4 }}>
          <input className="input" placeholder="Search characters..." value={charSearch} onChange={(e) => setCharSearch(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={() => setSave({ kind: 'character', initialTag: '' })}>+ New</button>
        </div>
        <div className="lib-scroll">
          {characters.length === 0 ? (
            <div className="muted" style={{ padding: '10px 0', textAlign: 'center' }}>No characters yet.</div>
          ) : (
            <div className="char-grid cards-3">
              {characters.map((c) => (
                <div key={c.id} className={`char-card ${activeCharId === c.id ? 'selected' : ''}`}>
                  <div className={`char-thumb ${fitContain ? 'fit-contain' : ''}`} onClick={() => pickCharacter(c)} style={{ cursor: 'pointer' }}>
                    {c.preview ? <img src={c.preview} alt={c.name} loading="lazy" decoding="async" /> : <span className="noimg">[C]</span>}
                  </div>
                  <div className="char-body"><span className="char-name">{c.name}</span></div>
                  <div className="char-actions">
                    <button className="btn btn-primary" onClick={() => pickCharacter(c)}>Use</button>
                    <button className="icon-btn" title="Edit" onClick={() => setSave({ kind: 'character', editId: c.id, initialTag: c.target_profile || characterDesc(c), initialName: c.name, initialPreview: c.preview })}>edit</button>
                    <button className="icon-btn" title="Delete" onClick={() => delChar(c.id)}>del</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MIDDLE: combination (static) */}
      <div className="panel stack">
        <div className="row-between">
          <span className="section-title">Combination</span>
          <select className="select" style={{ width: 220 }} value={llmSel} onChange={(e) => changeLlm(e.target.value)}>
            <option value="">AI model: none (rules)</option>
            {llmOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="muted">Select character and pose.</div>

        <div className="field-pos">
          <div className="field-head">
            <label className="field-label">Positive Prompt</label>
            <button className="mini-clear" disabled={!positive} onClick={() => navigator.clipboard.writeText(positive)}>copy</button>
          </div>
          <textarea className="textarea textarea-positive" style={{ minHeight: 160 }} value={positive} onChange={(e) => setPositive(e.target.value)} placeholder="Apply a pose to build the combined prompt..." />
        </div>
        <div className="field-neg">
          <div className="field-head">
            <label className="field-label">Negative Prompt</label>
            <button className="mini-clear" disabled={!negative} onClick={() => navigator.clipboard.writeText(negative)}>copy</button>
          </div>
          <textarea className="textarea textarea-negative" style={{ minHeight: 110 }} value={negative} onChange={(e) => setNegative(e.target.value)} />
        </div>

        {error && <div className="error-panel">{error}</div>}

        <div className="row">
          <button className="btn" onClick={savePreset} disabled={!positive}>Save preset</button>
          {presets.length > 0 && (
            <select className="select" style={{ width: 150 }} defaultValue="" onChange={loadPreset}>
              <option value="">Load preset...</option>
              {presets.map((p, i) => <option key={p.ts} value={i}>{p.name}</option>)}
            </select>
          )}
          <button className="btn btn-primary spacer" disabled={!positive} onClick={() => onSendToGenerate({ positive, negative })}>
            Send to Generate ->
          </button>
        </div>
      </div>

      {/* RIGHT: poses */}
      <div className="panel stack">
        <div className="char-lib-head">
          <input className="input" placeholder="Search poses..." value={poseSearch} onChange={(e) => setPoseSearch(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div className="lib-scroll">
          {poses.length === 0 ? (
            <div className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>
              No poses yet. Extract from an image and press "save" under the clothing/pose box.
            </div>
          ) : (
            <div className="char-grid cards-3">
              {poses.map((p) => (
                <div key={p.id} className={`char-card ${activePoseId === p.id ? 'selected' : ''}`}>
                  <div className={`char-thumb ${fitContain ? 'fit-contain' : ''}`}>
                    {p.preview ? <img src={p.preview} alt={p.name} loading="lazy" decoding="async" /> : <span className="noimg">[P]</span>}
                  </div>
                  <div className="char-body"><span className="char-name">{p.name}</span></div>
                  <div className="char-actions">
                    <button className="btn btn-primary" onClick={() => applyPose(p)}>Apply</button>
                    <button className="icon-btn" title="Edit" onClick={() => setSave({ kind: 'pose', editId: p.id, initialTag: p.prompt, initialName: p.name, initialPreview: p.preview })}>edit</button>
                    <button className="icon-btn" title="Delete" onClick={() => delPose(p.id)}>del</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {save && (
        <SaveModal
          kind={save.kind}
          editId={save.editId || null}
          initialTag={save.initialTag || ''}
          initialName={save.initialName || ''}
          initialPreview={save.initialPreview || null}
          onClose={() => setSave(null)}
          onSaved={afterSave}
        />
      )}
    </div>
  )
}
