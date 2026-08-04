// "Upscale" tab: send an image through ComfyUI's RealESRGAN model (x4) and show
// the downloadable result.

import React, { useState, useRef } from 'react'
import api from '../services/api'
import { indexPendingImages } from '../services/imageIndexer'
import * as genGate from '../services/genGate'

// Reads a file as a full-resolution base64 data URL (no downscaling - we want
// the original pixels so the upscaler has the most to work with).
function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('Could not read that image.'))
    r.readAsDataURL(file)
  })
}

export default function UpscaleTab() {
  const [image, setImage] = useState(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const readFile = (file) => {
    if (!file) return
    setError(''); setResult(null)
    readDataUrl(file).then(setImage).catch((e) => setError(e.message))
  }

  const start = async () => {
    if (!image) return
    setBusy(true); setError(''); setResult(null); setSaved(false)
    genGate.setGenerating(true) // upscale uses the GPU too - pause the indexer
    try {
      const r = await api.upscale(image)
      if (r.cancelled) { setError('Upscale was cancelled.'); return }
      setResult(r.image)
      setSaved(true)
      // It's now in the Generate history - tell Home to refresh and index it.
      window.dispatchEvent(new Event('ov-history-changed'))
    } catch (err) {
      setError(/not running/i.test(err.message) ? 'ComfyUI is not running.' : err.message)
    } finally {
      setBusy(false)
      genGate.setGenerating(false)
      indexPendingImages().catch(() => {}) // index now that the GPU is free
    }
  }

  const stop = async () => { try { await api.cancelGenerate() } catch { /* ignore */ } }

  return (
    <div className="stack">
      <div className="replicate-2col">
        <div className="panel stack">
          <div className="section-title">Source image</div>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onClick={() => inputRef.current && inputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files && e.dataTransfer.files[0]) }}
          >
            {image ? <img src={image} alt="source" /> : <div>Drag an image here<br />or click to browse</div>}
            <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => readFile(e.target.files && e.target.files[0])} />
          </div>
          {busy ? (
            <button className="btn btn-danger btn-block" onClick={stop}>Stop</button>
          ) : (
            <button className="btn btn-primary btn-block" disabled={!image} onClick={start}>Start</button>
          )}
          <div className="muted">Uses the ComfyUI RealESRGAN anime model (x4). Keep ComfyUI running.</div>
          {error && <div className="error-panel">{error}</div>}
        </div>

        <div className="panel stack">
          <div className="section-title">Result</div>
          <div className="dropzone" style={{ cursor: 'default' }}>
            {result
              ? <img src={result} alt="upscaled" />
              : <div className="muted">{busy ? 'Working... this can take a moment' : 'The upscaled image will appear here'}</div>}
          </div>
          {result && (
            <>
              {saved && <div className="muted" style={{ color: 'var(--green)' }}>v Saved to your Generate history</div>}
              <a className="btn btn-block" href={result} download target="_blank" rel="noreferrer">Download</a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
