// Generate view. Lays out the config panel, prompt panel, live preview and the
// history gallery, and orchestrates generation (progress + auto visual indexing
// of each new image).

import React, { useState, useEffect, useCallback, useRef } from 'react'
import PromptPanel from '../components/PromptPanel'
import ConfigPanel from '../components/ConfigPanel'
import HistoryGallery from '../components/HistoryGallery'
import ResolutionPicker from '../components/ResolutionPicker'
import LoraPicker from '../components/LoraPicker'
import DetailView from '../components/DetailView'
import { indexPendingImages } from '../services/imageIndexer'
import * as genGate from '../services/genGate'
import SettingsPanel from '../components/SettingsPanel'
import { useModels } from '../hooks/useModels'
import { useHistory } from '../hooks/useHistory'
import { useLoras } from '../hooks/useLoras'
import { RESOLUTIONS } from '../resolutions'
import api from '../services/api'

export default function Home({ positive, negative, setPositive, setNegative, onGoDesigns, onHome, autoOpenSettings, onSettingsHandled, active = true, fitContain = false, setFitContain }) {
  const models = useModels()
  const history = useHistory()

  const [checkpoint, setCheckpoint] = useState('')
  const [workflows, setWorkflows] = useState([])
  const [workflow, setWorkflow] = useState('')
  const [resolution, setResolution] = useState(RESOLUTIONS[0])
  const [quantity, setQuantity] = useState(1)
  const [lora, setLora] = useState(null)

  const [generating, setGenerating] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
  const [genPercent, setGenPercent] = useState(null)
  const [preview, setPreview] = useState(null)

  const [settings, setSettings] = useState({ containMode: false, ollamaModel: '' })
  const [health, setHealth] = useState({ backend: false, comfyui: false, llm: false, version: '' })

  const [showSettings, setShowSettings] = useState(false)
  const [showResolution, setShowResolution] = useState(false)
  const [showLora, setShowLora] = useState(false)
  const [detail, setDetail] = useState(null)
  const [similarBase, setSimilarBase] = useState(null)

  const savedRef = useRef(null)     // settings loaded from backend
  const appliedRef = useRef(false)  // becomes true once saved selections are applied
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const currentWf = workflows.find((w) => w.name === workflow)
  const loraSupported = !!(currentWf && currentWf.supportsLora)
  const loras = useLoras(loraSupported)

  // initial loads
  useEffect(() => {
    api.workflows().then((d) => {
      const items = d.items || []
      setWorkflows(items)
      setWorkflow((prev) => prev || (items[0] && items[0].name) || '')
    }).catch(() => setWorkflows([]))
    api.getSettings().then((s) => { setSettings(s); savedRef.current = s; setSettingsLoaded(true) }).catch(() => setSettingsLoaded(true))
    history.reload()
  }, []) // eslint-disable-line

  // Other tabs (e.g. Upscale) can add images to the history; refresh when they do.
  useEffect(() => {
    const onChanged = () => history.reload()
    window.addEventListener('ov-history-changed', onChanged)
    return () => window.removeEventListener('ov-history-changed', onChanged)
  }, []) // eslint-disable-line

  // Open Settings if we arrived via the landing "SETTINGS" option.
  useEffect(() => {
    if (autoOpenSettings) { setShowSettings(true); onSettingsHandled && onSettingsHandled() }
  }, [autoOpenSettings]) // eslint-disable-line

  // ESC on Generate: close an open modal first, otherwise go to the landing.
  useEffect(() => {
    if (!active) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
      if (showSettings) { setShowSettings(false); return }
      if (showResolution) { setShowResolution(false); return }
      if (showLora) { setShowLora(false); return }
      if (detail) { setDetail(null); return }
      onHome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, showSettings, showResolution, showLora, detail]) // eslint-disable-line

  // Apply saved selections once models + workflows + settings are ALL available.
  // Waiting for settingsLoaded means the saved checkpoint is honored even after
  // an F5 reload (no transient flip to the first alphabetical checkpoint).
  useEffect(() => {
    if (appliedRef.current) return
    if (!models.items.length || !workflows.length || !settingsLoaded) return
    const s = savedRef.current || {}

    if (s.lastCheckpoint && models.items.includes(s.lastCheckpoint)) setCheckpoint(s.lastCheckpoint)
    else setCheckpoint(models.items[0])

    if (s.lastWorkflow && workflows.some((w) => w.name === s.lastWorkflow)) setWorkflow(s.lastWorkflow)

    const res = RESOLUTIONS.find((r) => r.w === s.lastWidth && r.h === s.lastHeight)
    if (res) setResolution(res)
    if (s.lastQuantity) setQuantity(s.lastQuantity)

    appliedRef.current = true
  }, [models.items, workflows, settingsLoaded]) // eslint-disable-line

  // Persist selections after they've been applied (debounced).
  useEffect(() => {
    if (!appliedRef.current) return
    const t = setTimeout(() => {
      api.setSettings({
        lastCheckpoint: checkpoint,
        lastWorkflow: workflow,
        lastWidth: resolution.w,
        lastHeight: resolution.h,
        lastQuantity: quantity
      }).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [checkpoint, workflow, resolution, quantity])

  // preview = newest history image on first load
  useEffect(() => {
    if (history.items.length && !preview) setPreview(history.items[0].image)
  }, [history.items]) // eslint-disable-line

  // Health polling - self-scheduling so it can pause and adapt:
  //    paused entirely while the tab is hidden (resumes on focus)
  //    paused entirely WHILE GENERATING (don't ping ComfyUI during sampling)
  //    15s when idle and visible (light on resources)
  const pollHealth = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try { setHealth(await api.health()) } catch { setHealth({ backend: false, comfyui: false, llm: false, version: '' }) }
  }, [])
  useEffect(() => {
    let timer = null
    const schedule = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'hidden') return // resumed by visibilitychange
      if (generating) return // resumed when generation ends (effect re-runs)
      timer = setTimeout(run, 15000)
    }
    const run = async () => { await pollHealth(); schedule() }
    if (!generating) pollHealth()
    schedule()
    const onVis = () => {
      if (document.visibilityState === 'visible') { pollHealth(); schedule() }
      else clearTimeout(timer)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [pollHealth, generating])

  // search / favorites reload
  useEffect(() => {
    const t = setTimeout(() => history.reload({ search: history.search }), 250)
    return () => clearTimeout(t)
  }, [history.search]) // eslint-disable-line
  useEffect(() => { history.reload({ favoritesOnly: history.favoritesOnly }) }, [history.favoritesOnly]) // eslint-disable-line

  // Auto-index pending IMAGE embeddings in the background once, on app start
  // (handy when you copy an old folder into a new version). Silent + best-effort.
  const autoIdxRef = useRef(false)
  useEffect(() => {
    if (autoIdxRef.current) return
    autoIdxRef.current = true
    const t = setTimeout(() => { indexPendingImages().catch(() => {}) }, 2500)
    return () => clearTimeout(t)
  }, [])

  const onGenerate = async () => {
    setGenerating(true)
    genGate.setGenerating(true) // pause the visual indexer so ComfyUI gets the GPU
    setProgressLabel('Sending to ComfyUI...')
    setGenPercent(null)
    try {
      const res = await api.generate({
        positive, negative, checkpoint, workflow,
        width: resolution.w, height: resolution.h,
        quantity: Math.max(1, Math.min(100, Number(quantity) || 1)), lora
      })
      setProgressLabel('Finishing...')
      const fresh = await history.reload()
      if (fresh.length) setPreview(fresh[0].image)
      if (res.cancelled) setProgressLabel('Cancelled')
      else {
        // Index the new image only once the GPU/main-thread is free, so it never
        // competes with the sampler or with editing the prompt right after.
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000))
        idle(() => indexPendingImages().catch(() => {}))
      }
    } catch (err) {
      alert('Generation failed: ' + err.message)
    } finally {
      setGenerating(false)
      genGate.setGenerating(false) // generation done -> indexer may resume
      setProgressLabel('')
    }
  }

  const onStop = async () => { try { await api.cancelGenerate() } catch {} }

  // Poll ComfyUI step progress (percentage) while generating.
  useEffect(() => {
    if (!generating) return
    let alive = true
    const tick = async () => {
      try {
        const p = await api.generateProgress()
        if (!alive) return
        if (p && p.percent != null && p.max) {
          const batch = p.total > 1 ? ` - image ${p.image}/${p.total}` : ''
          setProgressLabel(`Generating ${p.percent}%${batch}`)
          setGenPercent(p.percent)
        }
      } catch { /* ignore */ }
    }
    const t = setInterval(tick, 600)
    tick()
    return () => { alive = false; clearInterval(t) }
  }, [generating])

  const onRefresh = async () => {
    try {
      await api.refreshModels()
      await models.reload()
      const d = await api.workflows(); setWorkflows(d.items || [])
      await loras.reload()
    } catch (err) { alert('Refresh failed: ' + err.message) }
  }

  const openDetail = useCallback((item) => setDetail(item), [])

  // Stable callback for the gallery (keeps React.memo effective): read the
  // latest history via a ref so this function's identity never changes.
  const histRef = useRef(history); histRef.current = history
  const clearSimilarRef = useCallback(() => { setSimilarBase(null); histRef.current.clearSimilar() }, [])
  const toggleFav = async (id) => {
    await api.toggleFavorite(id)
    const fresh = await history.reload()
    const updated = fresh.find((x) => x.id === id)
    if (updated && detail && detail.id === id) setDetail(updated)
  }
  const del = async (id) => {
    await api.deleteImage(id)
    setDetail(null)
    const fresh = await history.reload()
    if (fresh.length) setPreview(fresh[0].image); else setPreview(null)
  }

  return (
    <div className="app app-wide gen-shell">
      <div className="app-header">
        <button className="btn btn-ghost" onClick={onHome}>{'<- Home'}</button>
      </div>
      <div className="home-grid">
        <div className="home-left">
          <PromptPanel
            positive={positive} negative={negative}
            setPositive={setPositive} setNegative={setNegative}
            preview={preview}
            onPreviewClick={() => history.items[0] && setDetail(history.items[0])}
            generating={generating}
            onGenerate={onGenerate} onStop={onStop}
            onClearPositive={() => setPositive('')}
            onClearNegative={() => setNegative('')}
          />

          <div className="history-scroll">
            <HistoryGallery
              items={history.items}
              search={history.search} setSearch={history.setSearch}
              favoritesOnly={history.favoritesOnly} setFavoritesOnly={history.setFavoritesOnly}
              similarTo={history.similarTo} similarBase={similarBase}
              clearSimilar={clearSimilarRef}
              error={history.error}
              page={history.page} totalPages={history.totalPages} total={history.total}
              loading={history.loading} goToPage={history.goToPage}
              onOpen={openDetail}
              containMode={settings.containMode}
            />
          </div>
        </div>

        <ConfigPanel
          onOpenSettings={() => setShowSettings(true)}
          checkpoints={models.items} checkpoint={checkpoint} setCheckpoint={setCheckpoint}
          workflows={workflows} workflow={workflow} setWorkflow={setWorkflow}
          loraSupported={loraSupported} lora={lora}
          onPickLora={() => setShowLora(true)} onClearLora={() => setLora(null)}
          resolution={resolution} onOpenResolution={() => setShowResolution(true)}
          quantity={quantity} setQuantity={setQuantity}
          onRefresh={onRefresh} refreshing={models.loading}
          onGoDesigns={onGoDesigns}
          health={health}
          generating={generating} progressLabel={progressLabel} genPercent={genPercent}
        />
      </div>

      {showSettings && (
        <SettingsPanel settings={settings} onClose={() => setShowSettings(false)} onSaved={setSettings} fitContain={fitContain} setFitContain={setFitContain} />
      )}
      {showResolution && (
        <ResolutionPicker current={resolution} onPick={setResolution} onClose={() => setShowResolution(false)} />
      )}
      {showLora && (
        <LoraPicker loras={loras.items} current={lora} onPick={setLora} onClose={() => setShowLora(false)} />
      )}
      {detail && (
        <DetailView
          item={detail}
          onClose={() => setDetail(null)}
          onToggleFavorite={toggleFav}
          onDelete={del}
          onFindSimilar={(id) => { setSimilarBase(detail); setDetail(null); history.findSimilar(id) }}
        />
      )}
    </div>
  )
}
