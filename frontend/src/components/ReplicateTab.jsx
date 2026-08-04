// "Replicate" tab: extract a faithful prompt from an uploaded image.

import React, { useState, useRef } from 'react'
import api from '../services/api'
import { resizeImageFile } from '../utils/image'

// Strong, quality-focused default negative for faithful replication.
const REPLICATE_NEG =
  'lowres, worst quality, low quality, normal quality, jpeg artifacts, blurry, ' +
  'bad anatomy, bad hands, bad proportions, missing fingers, extra fingers, ' +
  'extra digits, fewer digits, mutated hands, deformed, disfigured, ugly, ' +
  'signature, watermark, username, text, logo, cropped, out of frame, ' +
  'duplicate, error, jpeg artifacts'

export default function ReplicateTab({ onSendToGenerate }) {
  const [image, setImage] = useState(null)
  const [drag, setDrag] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState(REPLICATE_NEG)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const readFile = (file) => {
    if (!file) return
    setError('')
    resizeImageFile(file, 1024)
      .then((d) => setImage(d))
      .catch(() => setError('Could not read that image.'))
  }

  // WD14 tags, exactly as returned (no LLM filtering) -> positive prompt.
  const extractTags = async () => {
    if (!image) return
    setTagging(true); setError('')
    try {
      const r = await api.tag({ image })
      setPositive(r.tags || '')
    } catch (err) { setError(err.message) } finally { setTagging(false) }
  }

  // Cancel the running extraction (interrupts the ComfyUI tagger job).
  const cancelTags = async () => { try { await api.cancelGenerate() } catch { /* ignore */ } }

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
          {tagging ? (
            <button className="btn btn-danger btn-block" onClick={cancelTags}>Cancel</button>
          ) : (
            <button className="btn btn-primary btn-block" disabled={!image} onClick={extractTags}>Extract Tags</button>
          )}
          {error && <div className="error-panel">{error}</div>}
        </div>

        <div className="panel stack">
          <div className="section-title">Result</div>
          <div className="field-pos">
            <div className="field-head">
              <label className="field-label">Positive Prompt (exact)</label>
              <button className="mini-clear" disabled={!positive} onClick={() => navigator.clipboard.writeText(positive)}>copy</button>
            </div>
            <textarea className="textarea textarea-positive" style={{ minHeight: 150 }} value={positive} onChange={(e) => setPositive(e.target.value)} placeholder="Extract tags to fill the positive prompt..." />
          </div>
          <div className="field-neg">
            <div className="field-head">
              <label className="field-label">Negative Prompt (quality default)</label>
              <button className="mini-clear" onClick={() => navigator.clipboard.writeText(negative)}>copy</button>
            </div>
            <textarea className="textarea textarea-negative" style={{ minHeight: 110 }} value={negative} onChange={(e) => setNegative(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn btn-primary spacer" disabled={!positive} onClick={() => onSendToGenerate({ positive, negative })}>
              Send to Generate ->
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
