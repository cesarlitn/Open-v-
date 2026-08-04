// Small modal to save a character or a pose into the local library.

import React, { useState, useRef } from 'react'
import api from '../services/api'
import { resizeImageFile } from '../utils/image'

// Small centered modal. kind='character' (needs a name) or 'pose' (image + tag).
export default function SaveModal({ kind, editId = null, initialTag = '', initialName = '', initialPreview = null, onClose, onSaved }) {
  const isChar = kind === 'character'
  const [tag, setTag] = useState(initialTag)
  const [name, setName] = useState(initialName)
  const [previewBase64, setPreviewBase64] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(initialPreview)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const pick = (file) => {
    if (!file) return
    resizeImageFile(file, 800)
      .then((d) => { setPreviewBase64(d); setPreviewUrl(d) })
      .catch(() => setError('Could not read that image.'))
  }

  const save = async () => {
    if (isChar && !name.trim()) { setError('Name is required'); return }
    if (!tag.trim()) { setError('Tag is empty'); return }
    setSaving(true); setError('')
    try {
      if (isChar) {
        const payload = { name: name.trim(), target_profile: tag }
        if (previewBase64) payload.previewBase64 = previewBase64
        if (editId) await api.updateCharacter(editId, payload)
        else await api.createCharacter(payload)
      } else {
        const auto = initialName || (tag.split(',')[0] || 'pose').trim().slice(0, 28) || 'pose'
        const payload = { name: auto, prompt: tag }
        if (previewBase64) payload.previewBase64 = previewBase64
        if (editId) await api.updatePose(editId, payload)
        else await api.createPose(payload)
      }
      onSaved && onSaved()
      onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{editId ? 'Edit' : 'Save'} {isChar ? 'character' : 'pose'}</span>
          <button className="icon-btn" onClick={onClose}>x</button>
        </div>

        <div className="stack">
          <div className="save-thumb" onClick={() => fileRef.current && fileRef.current.click()}>
            {previewUrl ? <img src={previewUrl} alt="reference" /> : <div>Click to add a reference photo (optional)</div>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files && e.target.files[0])} />
          </div>

          {isChar && (
            <div>
              <label className="field-label">Name *</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reze" />
            </div>
          )}

          <div>
            <label className="field-label">Tag</label>
            <textarea className="textarea" style={{ minHeight: 110 }} value={tag} onChange={(e) => setTag(e.target.value)} />
          </div>

          {error && <div className="error-panel">{error}</div>}

          <div className="row-between">
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
