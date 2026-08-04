// Paginated 9x5 history grid. Sticky search + favorites toggle, visual-similarity
// banner, per-result proximity badge, and a background thumbnail optimizer.

import React, { useState, useRef, useCallback, useEffect } from 'react'
import api from '../services/api'

const THUMB_MAX = 400  // longest side of the stored thumbnail
const JPEG_Q = 0.82

// Downscale one image in the browser canvas -> small JPEG data URL.
function makeThumb(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scale = Math.min(1, THUMB_MAX / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      try { resolve(c.toDataURL('image/jpeg', JPEG_Q)) } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('load failed'))
    img.src = url
  })
}

function Thumb({ it, src, containMode, onOpen }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`thumb ${containMode ? 'contain' : 'cover'} ${loaded ? 'ready' : ''}`} onClick={() => onOpen(it)}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`fade ${loaded ? 'is-loaded' : ''}`}
        onLoad={() => setLoaded(true)}
      />
      {it.score != null && <span className="badge-score">{Math.round(it.score * 100)}%</span>}
      <span className="badge-res">{it.width}x{it.height}</span>
    </div>
  )
}

function HistoryGallery({
  items, search, setSearch, favoritesOnly, setFavoritesOnly,
  similarTo, similarBase, clearSimilar, error,
  page, totalPages, total, loading, goToPage, onOpen, containMode
}) {
  const [thumbMap, setThumbMap] = useState({}) // id -> optimized thumb url
  const [optimizing, setOptimizing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const cancelRef = useRef(false)
  const runningRef = useRef(false)

  const pending = items.filter((it) => !it.thumbOptimized && !thumbMap[it.id])

  const optimize = useCallback(async () => {
    if (runningRef.current) return
    const todo = items.filter((it) => !it.thumbOptimized && !thumbMap[it.id])
    if (!todo.length) return
    runningRef.current = true
    setOptimizing(true); cancelRef.current = false
    setProgress({ done: 0, total: todo.length })
    for (let i = 0; i < todo.length; i++) {
      if (cancelRef.current) break
      const it = todo[i]
      try {
        const dataUrl = await makeThumb(it.image)
        const r = await api.saveThumb(it.id, dataUrl)
        setThumbMap((m) => ({ ...m, [it.id]: r.thumbnail || dataUrl }))
      } catch { /* skip this one */ }
      setProgress({ done: i + 1, total: todo.length })
      await new Promise((res) => setTimeout(res, 0)) // yield to keep UI smooth
    }
    runningRef.current = false
    setOptimizing(false)
  }, [items, thumbMap])

  // Auto-optimize in the background whenever full-res thumbnails appear
  // (first load, after "Load More", or new generations) - no button needed.
  useEffect(() => {
    if (!optimizing && pending.length > 0) optimize()
  }, [items, optimizing, pending.length, optimize])

  const srcFor = (it) => thumbMap[it.id] || it.thumbnail

  return (
    <div className="panel">
      <div className="history-head">
        <input
          className="input"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <div
          className={`toggle ${favoritesOnly ? 'on' : ''}`}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          title="Favorites only"
        >
          <span className="toggle-track"><span className="toggle-thumb" /></span>
          <span className="muted">* Favorites</span>
        </div>
      </div>

      {optimizing && (
        <div className="optimize-bar">
          <div className="optimize-track"><div className="optimize-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <span className="muted">Optimizing thumbnails {progress.done}/{progress.total}</span>
          <button className="btn btn-ghost" onClick={() => { cancelRef.current = true }}>Stop</button>
        </div>
      )}

      {similarTo && (
        <div className="similar-ref">
          {similarBase && (
            <img
              className="similar-ref-img"
              src={similarBase.thumbnail || similarBase.image}
              alt="reference"
              onClick={() => onOpen && onOpen(similarBase)}
            />
          )}
          <button className="btn btn-ghost" onClick={clearSimilar}>x Clear</button>
        </div>
      )}

      {error && (
        <div className="error-panel" style={{ marginBottom: 12 }}>
          {error}
          {similarTo && /not indexed/i.test(error) && ' - go to Settings -> Visual search and press "Index images".'}
        </div>
      )}

      {items.length === 0 ? (
        <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
          {loading ? 'Loading...'
            : similarTo ? 'No similar images found yet. Index more images in Settings -> Visual search.'
            : 'No images yet.'}
        </div>
      ) : (
        <div className="history-grid">
          {items.map((it) => (
            <Thumb key={it.id} it={it} src={srcFor(it)} containMode={containMode} onOpen={onOpen} />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="pager">
          <button className="btn" disabled={page <= 1 || loading} onClick={() => goToPage(1)} title="First">{'<<'}</button>
          <button className="btn" disabled={page <= 1 || loading} onClick={() => goToPage(page - 1)}> Prev</button>
          <span className="pager-info">Page {page} / {totalPages} - {total} images</span>
          <button className="btn" disabled={page >= totalPages || loading} onClick={() => goToPage(page + 1)}>Next </button>
          <button className="btn" disabled={page >= totalPages || loading} onClick={() => goToPage(totalPages)} title="Last">{'>>'}</button>
        </div>
      )}
    </div>
  )
}

// Memoized: prompt typing in Home must not re-render the whole gallery.
export default React.memo(HistoryGallery)
