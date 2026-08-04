// Startup data migration helpers.
//
//  1) reanchorPaths(): media paths are stored ABSOLUTE. When an old DB/folder is
//     copied into a new project, those absolutes point at the old location. We
//     rewrite any path containing a "generated" or "thumbnails" segment to the
//     current GENERATED_DIR / THUMBS_DIR so things resolve again.
//
//  2) relocateThumbs(): older versions wrote thumbnails as "<name>_thumb.<ext>"
//     INSIDE generated/. That made copying the folder duplicate files and even
//     create "_thumb_thumb". We MOVE every such file into the separate
//     thumbnails/ folder (mirroring the path, dropping the _thumb suffix) and
//     repoint the DB. generated/ is left as pristine originals.
//
//  3) importGenerated(): rebuilds history straight from generated/ (so you only
//     need to copy that one folder). Picks up an existing thumbnail from
//     thumbnails/ if present.

const fs = require('fs')
const path = require('path')
const db = require('../database/db')
const comfyui = require('./comfyui')

const IMG_RE = /\.(png|jpe?g|webp)$/i
const THUMB_RE = /^(.*)_thumb(\.(png|jpe?g|webp))$/i
const SKIP_DIRS = new Set(['characters', 'poses', 'loras-previews'])

// ---------- re-anchor ----------
function reanchor(p) {
  if (!p || typeof p !== 'string') return p
  if (p.startsWith('data:')) return p
  const tokens = p.split(/[\\/]+/).filter(Boolean)
  const ti = tokens.lastIndexOf('thumbnails')
  const gi = tokens.lastIndexOf('generated')
  if (ti !== -1 && ti >= gi) {
    const tail = tokens.slice(ti + 1)
    return tail.length ? path.join(comfyui.THUMBS_DIR, ...tail) : p
  }
  if (gi !== -1) {
    const tail = tokens.slice(gi + 1)
    return tail.length ? path.join(comfyui.GENERATED_DIR, ...tail) : p
  }
  return p
}

function reanchorTable(table, cols) {
  let rows = []
  try { rows = db.selectAll(`SELECT id, ${cols.join(', ')} FROM ${table}`) } catch { return 0 }
  let changed = 0
  for (const r of rows) {
    const sets = []; const vals = []
    for (const c of cols) {
      const nv = reanchor(r[c])
      if (nv !== r[c]) { sets.push(`${c} = ?`); vals.push(nv) }
    }
    if (sets.length) { vals.push(r.id); db.runQuiet(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, vals); changed++ }
  }
  return changed
}

function reanchorPaths() {
  let total = 0
  total += reanchorTable('generations', ['image_path', 'thumbnail_path'])
  total += reanchorTable('characters', ['preview_path'])
  total += reanchorTable('poses', ['preview_path'])
  if (total) {
    try { db.persist() } catch { /* ignore */ }
    console.log(`  [migrate] re-anchored ${total} media path(s) to this project`)
  }
  return total
}

// ---------- relocate legacy _thumb files ----------
function relocateThumbs() {
  const G = comfyui.GENERATED_DIR
  const T = comfyui.THUMBS_DIR
  if (!fs.existsSync(G)) return 0

  const found = []
  const stack = [G]
  while (stack.length) {
    const d = stack.pop()
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name.toLowerCase())) stack.push(full); continue }
      const mm = THUMB_RE.exec(e.name)
      if (mm) found.push({ full, dir: d, newName: mm[1] + mm[2] })
    }
  }

  let moved = 0
  for (const it of found) {
    const rel = path.relative(G, it.dir)
    const destDir = path.join(T, rel)
    const dest = path.join(destDir, it.newName)
    try { fs.mkdirSync(destDir, { recursive: true }) } catch { /* ignore */ }
    try {
      fs.renameSync(it.full, dest)
    } catch {
      try { fs.copyFileSync(it.full, dest); fs.unlinkSync(it.full) } catch { continue }
    }
    try { db.runQuiet('UPDATE generations SET thumbnail_path = ?, thumb_opt = 1 WHERE thumbnail_path = ?', [dest, it.full]) } catch { /* ignore */ }
    moved++
  }
  if (moved) {
    try { db.persist() } catch { /* ignore */ }
    console.log(`  [migrate] moved ${moved} thumbnail(s) into the thumbnails/ folder`)
  }
  return moved
}

// ---------- PNG metadata ----------
function readPngMeta(buf) {
  const out = { width: 0, height: 0, texts: {} }
  if (buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return out
  out.width = buf.readUInt32BE(16)
  out.height = buf.readUInt32BE(20)
  let off = 8
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const dataStart = off + 8
    const dataEnd = dataStart + len
    if (dataEnd > buf.length) break
    if (type === 'tEXt') {
      const data = buf.slice(dataStart, dataEnd)
      const z = data.indexOf(0)
      if (z !== -1) out.texts[data.toString('latin1', 0, z)] = data.toString('latin1', z + 1)
    } else if (type === 'iTXt') {
      const data = buf.slice(dataStart, dataEnd)
      const z = data.indexOf(0)
      if (z !== -1) {
        const keyword = data.toString('latin1', 0, z)
        let p = z + 1 + 2
        const l1 = data.indexOf(0, p); p = (l1 === -1 ? p : l1 + 1)
        const l2 = data.indexOf(0, p); p = (l2 === -1 ? p : l2 + 1)
        out.texts[keyword] = data.toString('utf8', p)
      }
    }
    if (type === 'IDAT' || type === 'IEND') break
    off = dataEnd + 4
  }
  return out
}

function extractFromGraph(texts) {
  const res = { positive: '', negative: '', checkpoint: '' }
  const raw = texts.prompt || texts.workflow || texts.parameters
  if (!raw) return res
  let graph
  try { graph = JSON.parse(raw) } catch { return res }
  const clipTexts = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    const ct = node.class_type || node.type
    const inputs = node.inputs || {}
    if (ct && /CheckpointLoader/i.test(ct) && inputs.ckpt_name) res.checkpoint = String(inputs.ckpt_name)
    if (ct && /CLIPTextEncode/i.test(ct) && typeof inputs.text === 'string') clipTexts.push(inputs.text)
  }
  if (Array.isArray(graph)) graph.forEach(walk)
  else for (const k of Object.keys(graph)) walk(graph[k])
  if (clipTexts.length) {
    const sorted = [...clipTexts].sort((a, b) => b.length - a.length)
    res.positive = sorted[0] || ''
    if (sorted.length > 1) res.negative = sorted[sorted.length - 1]
  }
  return res
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function walkImages(dir, acc) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name.toLowerCase())) continue
      walkImages(full, acc)
    } else if (IMG_RE.test(e.name) && !THUMB_RE.test(e.name)) {
      acc.push(full)
    }
  }
}

// Returns an existing thumbnail path under thumbnails/ for an image, or null.
function findThumb(imageAbs) {
  const rel = path.relative(comfyui.GENERATED_DIR, imageAbs)
  const relDir = path.dirname(rel)
  const base = path.basename(rel, path.extname(rel))
  for (const ext of ['jpg', 'png', 'webp', 'jpeg']) {
    const cand = path.join(comfyui.THUMBS_DIR, relDir, `${base}.${ext}`)
    if (fs.existsSync(cand)) return cand
  }
  return null
}

function importGenerated() {
  const G = comfyui.GENERATED_DIR
  if (!fs.existsSync(G)) return 0

  const known = new Set()
  try {
    for (const r of db.selectAll('SELECT image_path FROM generations')) {
      if (r.image_path) known.add(path.resolve(r.image_path))
    }
  } catch { /* empty */ }

  const files = []
  walkImages(G, files)

  let added = 0
  for (const abs of files) {
    if (known.has(path.resolve(abs))) continue
    let meta = { width: 0, height: 0, texts: {} }
    try { meta = readPngMeta(fs.readFileSync(abs)) } catch { /* still import */ }
    const g = extractFromGraph(meta.texts)
    const existingThumb = findThumb(abs)
    const thumbPath = existingThumb || abs
    let created
    try { created = fmtDate(fs.statSync(abs).mtime) } catch { created = fmtDate(new Date()) }

    db.runQuiet(
      `INSERT INTO generations
         (image_path, thumbnail_path, mode, checkpoint, positive_prompt, negative_prompt, width, height, created_at, favorite, thumb_opt)
       VALUES (?, ?, 'SFW', ?, ?, ?, ?, ?, ?, 0, ?)`,
      [abs, thumbPath, g.checkpoint || '', g.positive || '', g.negative || '', meta.width || 0, meta.height || 0, created, existingThumb ? 1 : 0]
    )
    added++
  }

  if (added) {
    try { db.persist() } catch { /* ignore */ }
    console.log(`  [migrate] imported ${added} image(s) from generated/ into the history`)
  }
  return added
}

module.exports = { reanchorPaths, relocateThumbs, importGenerated, reanchor, readPngMeta, extractFromGraph }
