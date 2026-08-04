// Settings - full-page interface (autosaves on change). Sections: appearance,
// image fit, LLM provider, visual search, Workflows.

import React, { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { getTheme, applyTheme } from '../utils/theme'

const CLOUD_LABELS = { anthropic: 'Claude (Anthropic)', deepseek: 'DeepSeek', gemini: 'Gemini (Google)', openai: 'OpenAI' }

export default function SettingsPanel({ settings, onClose, onSaved, fitContain = false, setFitContain }) {
  const [containMode, setContainMode] = useState(!!settings.containMode)
  const [theme, setTheme] = useState(getTheme())
  const [fit, setFit] = useState(!!fitContain)

  // LLM selection
  const initialCloud = settings.llmProvider && CLOUD_LABELS[settings.llmProvider]
  const [mode, setMode] = useState(initialCloud ? 'cloud' : 'local')
  const [localSel, setLocalSel] = useState(!initialCloud && settings.llmProvider && settings.llmModel ? `${settings.llmProvider}::${settings.llmModel}` : '')
  const [cloudProvider, setCloudProvider] = useState(initialCloud ? settings.llmProvider : 'anthropic')
  const [cloudModel, setCloudModel] = useState(initialCloud ? settings.llmModel : '')
  const [apiKey, setApiKey] = useState('')
  const [apiKeySet, setApiKeySet] = useState(!!settings.llmApiKeySet)

  const [localModels, setLocalModels] = useState([])
  const [cloudOpts, setCloudOpts] = useState([])
  const [providers, setProviders] = useState({})

  // Visual search status (image index counts). Indexing is automatic.
  const [imgStat, setImgStat] = useState(null)

  // Workflows management
  const [wfList, setWfList] = useState([])
  const [wfName, setWfName] = useState('')
  const [wfJson, setWfJson] = useState('')
  const [wfBusy, setWfBusy] = useState(false)
  const [wfMsg, setWfMsg] = useState('')
  const wfFileRef = useRef(null)

  // ----- autosave plumbing (debounced, batched, flush on close) -----
  const pendingRef = useRef({})
  const timerRef = useRef(null)
  const flushNow = () => {
    clearTimeout(timerRef.current)
    const p = pendingRef.current; pendingRef.current = {}
    if (Object.keys(p).length) api.setSettings(p).catch(() => { /* ignore */ })
  }
  const scheduleServer = (partial) => {
    pendingRef.current = { ...pendingRef.current, ...partial }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flushNow, 400)
  }
  const commit = (serverPartial, statePartial) => {
    scheduleServer(serverPartial)
    if (statePartial && onSaved) onSaved((prev) => ({ ...prev, ...statePartial }))
  }
  useEffect(() => () => flushNow(), []) // flush on unmount
  const close = () => { flushNow(); onClose() }

  const loadLlm = async () => {
    try {
      const d = await api.llmModels()
      setLocalModels(d.items || [])
      setCloudOpts(d.cloud || [])
      setApiKeySet(!!d.apiKeySet)
      if (mode === 'local' && !localSel && d.selected && !CLOUD_LABELS[d.selected.split('::')[0]]) setLocalSel(d.selected)
    } catch { setLocalModels([]); setCloudOpts([]) }
    try { const s = await api.llmStatus(); setProviders(s.providers || {}) } catch { setProviders({}) }
  }
  useEffect(() => { loadLlm() }, []) // eslint-disable-line

  const loadImgStatus = async () => {
    try { setImgStat(await api.imgStatus()) } catch { setImgStat(null) }
  }
  const loadWf = async () => {
    try { const r = await api.workflows(); setWfList(r.items || []) } catch { setWfList([]) }
  }
  useEffect(() => { loadImgStatus(); loadWf() }, []) // eslint-disable-line

  // ----- Workflows -----
  const onWfFile = (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    if (!wfName.trim()) setWfName(f.name.replace(/\.json$/i, ''))
    const r = new FileReader()
    r.onload = () => setWfJson(String(r.result || ''))
    r.readAsText(f)
  }
  const addWorkflow = async () => {
    setWfBusy(true); setWfMsg('')
    try {
      await api.workflowCreate(wfName.trim(), wfJson)
      setWfName(''); setWfJson(''); setWfMsg('Added')
      await loadWf()
    } catch (err) { setWfMsg(err.message) } finally { setWfBusy(false) }
  }
  const deleteWorkflow = async (name) => {
    try { await api.workflowDelete(name); await loadWf() } catch (err) { setWfMsg(err.message) }
  }

  const currentCloudModels = (cloudOpts.find((c) => c.id === cloudProvider) || {}).models || []

  // ----- change handlers (apply instantly) -----
  const changeTheme = (t) => { setTheme(applyTheme(t)) } // persisted to localStorage by util
  const toggleContain = () => { const v = !containMode; setContainMode(v); commit({ containMode: v }, { containMode: v }) }
  const toggleFit = () => { const v = !fit; setFit(v); if (setFitContain) setFitContain(v) } // localStorage via App

  const switchMode = (m) => {
    setMode(m)
    if (m === 'local') { const [p, mm] = localSel ? localSel.split('::') : ['', '']; commit({ llmProvider: p, llmModel: mm }, { llmProvider: p, llmModel: mm }) }
    else commit({ llmProvider: cloudProvider, llmModel: cloudModel }, { llmProvider: cloudProvider, llmModel: cloudModel })
  }
  const changeLocalSel = (v) => { setLocalSel(v); const [p, m] = v ? v.split('::') : ['', '']; commit({ llmProvider: p, llmModel: m }, { llmProvider: p, llmModel: m }) }
  const changeCloudProvider = (v) => { setCloudProvider(v); commit({ llmProvider: v, llmModel: cloudModel }, { llmProvider: v, llmModel: cloudModel }) }
  const changeCloudModel = (v) => { setCloudModel(v); commit({ llmProvider: cloudProvider, llmModel: v }, { llmProvider: cloudProvider, llmModel: v }) }
  const changeApiKey = (v) => { setApiKey(v); if (v) commit({ llmApiKey: v }, { llmApiKeySet: true }) }


  return (
    <div className="settings-page">
      <div className="settings-inner">
        <div className="settings-head">
          <button className="btn btn-ghost" onClick={close}>{'<- Back'}</button>
          <span className="settings-title">Settings</span>
          <span style={{ width: 70 }} />
        </div>

        <div className="stack">
          <div className="row-between">
            <div>
              <div style={{ fontWeight: 550 }}>Appearance</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className={`btn ${theme === 'dark' ? 'btn-primary' : ''}`} onClick={() => changeTheme('dark')}> Dark</button>
              <button className={`btn ${theme === 'light' ? 'btn-primary' : ''}`} onClick={() => changeTheme('light')}> Light</button>
            </div>
          </div>

          <div className="row-between" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <div>
              <div style={{ fontWeight: 550 }}>Aspect Ratio Fit</div>
            </div>
            <div className={`toggle ${containMode ? 'on' : ''}`} onClick={toggleContain}>
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </div>
          </div>

          <div className="row-between">
            <div>
              <div style={{ fontWeight: 550 }}>Models image fit</div>
            </div>
            <div className={`toggle ${fit ? 'on' : ''}`} onClick={toggleFit}>
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <span className="section-title">AI model for Compose</span>
              <button className="btn btn-ghost" onClick={loadLlm}>Refresh</button>
            </div>

            <div className="row" style={{ marginBottom: 12 }}>
              <button className={`btn ${mode === 'local' ? 'btn-primary' : ''}`} onClick={() => switchMode('local')}>Local</button>
              <button className={`btn ${mode === 'cloud' ? 'btn-primary' : ''}`} onClick={() => switchMode('cloud')}>API</button>
            </div>

            {mode === 'local' ? (
              <div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                  {Object.keys(providers).map((k) => (
                    <span key={k} className="status-line" style={{ padding: 0 }}>
                      <span className={`dot ${providers[k].connected ? 'on' : 'off'}`} />
                      {providers[k].label} ({providers[k].count})
                    </span>
                  ))}
                </div>
                <label className="field-label">Local model</label>
                <select className="select" value={localSel} onChange={(e) => changeLocalSel(e.target.value)}>
                  <option value="">None (rule-based tag split)</option>
                  {localModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
                <div className="muted" style={{ marginTop: 6 }}>Detects Ollama, LM Studio and llama.cpp automatically.</div>
              </div>
            ) : (
              <div className="stack">
                <div>
                  <label className="field-label">Provider</label>
                  <select className="select" value={cloudProvider} onChange={(e) => changeCloudProvider(e.target.value)}>
                    {cloudOpts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Model</label>
                  <input className="input" list="cloud-models" placeholder="e.g. claude-sonnet-4-5" value={cloudModel} onChange={(e) => changeCloudModel(e.target.value)} />
                  <datalist id="cloud-models">{currentCloudModels.map((m) => <option key={m} value={m} />)}</datalist>
                </div>
                <div>
                  <label className="field-label">API key {apiKeySet && <span className="muted">(saved - leave blank to keep)</span>}</label>
                  <input className="input" type="password" placeholder={apiKeySet ? ' saved' : 'paste your API key'} value={apiKey} onChange={(e) => changeApiKey(e.target.value)} />
                </div>
                <div className="muted">
                  The key is stored locally in your studio.db and only sent to {CLOUD_LABELS[cloudProvider]}. Keep it private.
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <div className="section-title" style={{ marginBottom: 10 }}>Visual search (find similar images)</div>
            <label className="field-label">Model</label>
            <div className="model-fixed">{(imgStat && imgStat.model) || 'Xenova/clip-vit-base-patch16'}</div>
            {imgStat && (
              <div className="muted" style={{ marginTop: 10 }}>
                Indexed {imgStat.indexed} / {imgStat.total} images
                {imgStat.pending > 0 ? ` - ${imgStat.pending} pending (auto)` : ' - up to date'}
              </div>
            )}
          </div>

          {/* ===== Workflows: add/remove ComfyUI API workflows without touching files ===== */}
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
            <div className="section-title" style={{ marginBottom: 10 }}>Workflows</div>

            {wfList.length > 0 && (
              <div className="wf-list">
                {wfList.map((w) => (
                  <div className="wf-row" key={w.name}>
                    <span className="wf-name">{w.name}{w.supportsLora ? ' - LoRA' : ''}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteWorkflow(w.name)}>Delete</button>
                  </div>
                ))}
              </div>
            )}

            <label className="field-label" style={{ marginTop: 12 }}>New workflow name</label>
            <input className="input" placeholder="e.g. my-portrait-flow" value={wfName} onChange={(e) => setWfName(e.target.value)} />
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn" onClick={() => wfFileRef.current && wfFileRef.current.click()}>Load .json file</button>
              <input ref={wfFileRef} type="file" accept="application/json,.json" hidden onChange={onWfFile} />
              <span className="muted">or paste the JSON below</span>
            </div>
            <textarea
              className="textarea" rows={4} style={{ marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              placeholder='{ "3": { "class_type": "KSampler", ... } }'
              value={wfJson} onChange={(e) => setWfJson(e.target.value)}
            />
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={addWorkflow} disabled={wfBusy || !wfName.trim() || !wfJson.trim()}>
                {wfBusy ? 'Saving...' : 'Add workflow'}
              </button>
              {wfMsg && <span className="muted">{wfMsg}</span>}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
