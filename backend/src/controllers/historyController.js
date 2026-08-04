// /api/history endpoints.

const fs = require('fs')
const path = require('path')
const db = require('../database/db')
const comfyui = require('../services/comfyui')

function toUrl(absPath) {
  if (!absPath) return null
  const T = comfyui.THUMBS_DIR
  const G = comfyui.GENERATED_DIR
  // Thumbnails live in a separate folder so generated/ stays pristine.
  const relT = path.relative(T, absPath)
  if (!relT.startsWith('..') && !path.isAbsolute(relT)) {
    return `/thumbnails/${relT.split(path.sep).join('/')}`
  }
  const rel = path.relative(G, absPath).split(path.sep).join('/')
  return `/generated/${rel}`
}

function shape(row) {
  return {
    id: row.id,
    image: toUrl(row.image_path),
    thumbnail: toUrl(row.thumbnail_path || row.image_path),
    mode: row.mode,
    checkpoint: row.checkpoint,
    positive: row.positive_prompt,
    negative: row.negative_prompt,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    favorite: !!row.favorite,
    thumbOptimized: !!row.thumb_opt
  }
}

function list(req, res, next) {
  try {
    const search = (req.query.search || '').trim()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30))
    const offset = (page - 1) * limit

    let where = ''
    const params = []
    if (search) {
      where = 'WHERE positive_prompt LIKE ? OR negative_prompt LIKE ?'
      params.push(`%${search}%`, `%${search}%`)
    }

    const rows = db.selectAll(
      `SELECT * FROM generations ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    )
    const totalRow = db.selectOne(
      `SELECT COUNT(*) AS c FROM generations ${where}`,
      params
    )
    res.json({
      items: rows.map(shape),
      total: totalRow ? totalRow.c : rows.length,
      page,
      limit
    })
  } catch (err) {
    next(err)
  }
}

function favorites(req, res, next) {
  try {
    const rows = db.selectAll(
      'SELECT * FROM generations WHERE favorite = 1 ORDER BY id DESC'
    )
    res.json({ items: rows.map(shape) })
  } catch (err) {
    next(err)
  }
}

function toggleFavorite(req, res, next) {
  try {
    const id = Number(req.body.id)
    const row = db.selectOne('SELECT favorite FROM generations WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Not found' })
    const next_ = row.favorite ? 0 : 1
    db.run('UPDATE generations SET favorite = ? WHERE id = ?', [next_, id])
    res.json({ ok: true, favorite: !!next_ })
  } catch (err) {
    next(err)
  }
}

function remove(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = db.selectOne('SELECT * FROM generations WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Not found' })
    // Best-effort file cleanup.
    for (const p of [row.image_path, row.thumbnail_path]) {
      try {
        if (p && fs.existsSync(p)) fs.unlinkSync(p)
      } catch {
        /* ignore */
      }
    }
    db.run('DELETE FROM generations WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// POST /api/history/:id/thumb  - stores a downscaled thumbnail (made in the
// browser canvas) in the SEPARATE thumbnails/ folder, mirroring the image's
// path. generated/ stays as pristine originals. No image library needed.
function saveThumb(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { thumbBase64 } = req.body || {}
    if (!thumbBase64) return res.status(400).json({ error: 'No thumbnail data' })
    const row = db.selectOne('SELECT * FROM generations WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Not found' })

    const m = /^data:image\/(\w+);base64,/.exec(thumbBase64)
    const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'jpg'
    const data = String(thumbBase64).replace(/^data:image\/\w+;base64,/, '')

    // Mirror the image's path under thumbnails/, base name without any _thumb.
    const rel = path.relative(comfyui.GENERATED_DIR, row.image_path)
    const relDir = path.dirname(rel)
    const base = path.basename(rel, path.extname(rel)).replace(/_thumb$/i, '')
    const thumbDir = path.join(comfyui.THUMBS_DIR, relDir)
    const thumbAbs = path.join(thumbDir, `${base}.${ext}`)
    const relThumb = path.relative(comfyui.THUMBS_DIR, thumbAbs)
    if (relThumb.startsWith('..') || path.isAbsolute(relThumb)) {
      return res.status(400).json({ error: 'Invalid image path' })
    }
    fs.mkdirSync(thumbDir, { recursive: true })
    fs.writeFileSync(thumbAbs, Buffer.from(data, 'base64'))

    db.run('UPDATE generations SET thumbnail_path = ?, thumb_opt = 1 WHERE id = ?', [thumbAbs, id])
    res.json({ ok: true, thumbnail: toUrl(thumbAbs) })
  } catch (err) {
    next(err)
  }
}

module.exports = { list, favorites, toggleFavorite, remove, saveThumb, shape }
