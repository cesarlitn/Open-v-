// /api/characters  - list / create / update / delete RPG character profiles.

const fs = require('fs')
const path = require('path')
const db = require('../database/db')
const comfyui = require('../services/comfyui')

const CHAR_DIR = path.join(comfyui.GENERATED_DIR, 'characters')

function nowPeru() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function toUrl(absPath) {
  if (!absPath) return null
  const rel = path.relative(comfyui.GENERATED_DIR, absPath).split(path.sep).join('/')
  return `/generated/${rel}`
}

function shape(row) {
  return {
    id: row.id,
    name: row.name,
    franchise: row.franchise || '',
    target_profile: row.target_profile || '',
    hair: row.hair || '',
    eyes: row.eyes || '',
    species_traits: row.species_traits || '',
    clothing: row.clothing || '',
    accessories: row.accessories || '',
    notes: row.notes || '',
    preview: toUrl(row.preview_path),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function savePreview(previewBase64, id) {
  if (!previewBase64) return ''
  try {
    if (!fs.existsSync(CHAR_DIR)) fs.mkdirSync(CHAR_DIR, { recursive: true })
    const data = String(previewBase64).replace(/^data:image\/\w+;base64,/, '')
    const abs = path.join(CHAR_DIR, `char_${id}.png`)
    fs.writeFileSync(abs, Buffer.from(data, 'base64'))
    return abs
  } catch {
    return ''
  }
}

function list(req, res, next) {
  try {
    const search = (req.query.search || '').trim()
    let rows
    if (search) {
      rows = db.selectAll(
        'SELECT * FROM characters WHERE name LIKE ? OR franchise LIKE ? ORDER BY name COLLATE NOCASE',
        [`%${search}%`, `%${search}%`]
      )
    } else {
      rows = db.selectAll('SELECT * FROM characters ORDER BY name COLLATE NOCASE')
    }
    res.json({ items: rows.map(shape) })
  } catch (err) {
    next(err)
  }
}

function create(req, res, next) {
  try {
    const b = req.body || {}
    if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'Name is required' })
    const now = nowPeru()
    const { lastID } = db.run(
      `INSERT INTO characters
        (name, franchise, target_profile, hair, eyes, species_traits, clothing, accessories, notes, preview_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
      [
        b.name.trim(), b.franchise || '', b.target_profile || '', b.hair || '', b.eyes || '',
        b.species_traits || '', b.clothing || '', b.accessories || '', b.notes || '', now, now
      ]
    )
    if (b.previewBase64) {
      const abs = savePreview(b.previewBase64, lastID)
      if (abs) db.run('UPDATE characters SET preview_path = ? WHERE id = ?', [abs, lastID])
    }
    const row = db.selectOne('SELECT * FROM characters WHERE id = ?', [lastID])
    res.json({ ok: true, character: shape(row) })
  } catch (err) {
    next(err)
  }
}

function update(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = db.selectOne('SELECT * FROM characters WHERE id = ?', [id])
    if (!existing) return res.status(404).json({ error: 'Not found' })
    const b = req.body || {}
    db.run(
      `UPDATE characters SET name=?, franchise=?, target_profile=?, hair=?, eyes=?,
         species_traits=?, clothing=?, accessories=?, notes=?, updated_at=? WHERE id=?`,
      [
        (b.name != null ? b.name : existing.name),
        (b.franchise != null ? b.franchise : existing.franchise),
        (b.target_profile != null ? b.target_profile : existing.target_profile),
        (b.hair != null ? b.hair : existing.hair),
        (b.eyes != null ? b.eyes : existing.eyes),
        (b.species_traits != null ? b.species_traits : existing.species_traits),
        (b.clothing != null ? b.clothing : existing.clothing),
        (b.accessories != null ? b.accessories : existing.accessories),
        (b.notes != null ? b.notes : existing.notes),
        nowPeru(), id
      ]
    )
    if (b.previewBase64) {
      const abs = savePreview(b.previewBase64, id)
      if (abs) db.run('UPDATE characters SET preview_path = ? WHERE id = ?', [abs, id])
    }
    const row = db.selectOne('SELECT * FROM characters WHERE id = ?', [id])
    res.json({ ok: true, character: shape(row) })
  } catch (err) {
    next(err)
  }
}

function remove(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = db.selectOne('SELECT * FROM characters WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Not found' })
    try { if (row.preview_path && fs.existsSync(row.preview_path)) fs.unlinkSync(row.preview_path) } catch { /* ignore */ }
    db.run('DELETE FROM characters WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

module.exports = { list, create, update, remove }
