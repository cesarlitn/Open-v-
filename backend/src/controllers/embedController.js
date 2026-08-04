// Visual similarity over the history (CLIP image embeddings + prompt tags).
//   GET  /api/embed/img-status   -> image-index counts
//   GET  /api/embed/img-pending  -> images still needing a visual embedding
//   POST /api/history/:id/imgembed -> save a browser-computed vector
//   GET  /api/history/similar    -> pose-first ranked similar images

const db = require('../database/db')
const emb = require('../services/embeddings')
const history = require('./historyController')

// ---- Visual similarity (CLIP image embeddings, computed in the browser) ----
const IMG_MODEL = require('../config').CLIP_MODEL

async function imgStatus(req, res, next) {
  try {
    const total = (db.selectOne('SELECT COUNT(*) AS c FROM generations') || {}).c || 0
    const indexed = (db.selectOne('SELECT COUNT(*) AS c FROM generations WHERE img_embed != \'\' AND img_embed_model = ?', [IMG_MODEL]) || {}).c || 0
    res.json({ model: IMG_MODEL, total, indexed, pending: Math.max(0, total - indexed) })
  } catch (err) { next(err) }
}

// Returns the next batch of images that still need a visual embedding (the
// browser will compute the vectors and POST them back).
function imgPending(req, res, next) {
  try {
    const limit = Math.max(1, Math.min(64, Number(req.query.limit) || 12))
    const rows = db.selectAll(
      'SELECT id, image_path, thumbnail_path FROM generations WHERE img_embed = \'\' OR img_embed_model != ? ORDER BY id DESC LIMIT ?',
      [IMG_MODEL, limit]
    )
    res.json({ model: IMG_MODEL, items: rows.map((r) => ({ id: r.id, image: history.shape(r).image })) })
  } catch (err) { next(err) }
}

function saveImgEmbed(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { vectorB64, model } = req.body || {}
    if (!vectorB64) return res.status(400).json({ error: 'No vector' })
    const row = db.selectOne('SELECT id FROM generations WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Not found' })
    db.run('UPDATE generations SET img_embed = ?, img_embed_model = ? WHERE id = ?', [vectorB64, model || IMG_MODEL, id])
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// Tag helpers for pose-first similarity.
const poses = require('./posesController')
function tagSet(s) {
  return new Set(String(s || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const uni = a.size + b.size - inter
  return uni ? inter / uni : 0
}
function splitSets(prompt) {
  const { character, outfit } = poses.splitHeuristic(prompt || '')
  return { char: tagSet(character), pose: tagSet(outfit) }
}

// "Find similar" ranks by POSE / clothing / scene first (from the real prompt
// tags), then by character match, with the visual CLIP score as a light helper.
// This way the same pose with a different character still shows up - which pure
// pixel similarity (CLIP) would miss because hair/eye color shifts the vector.
async function similar(req, res, next) {
  try {
    const id = Number(req.query.id)
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.max(1, Number(req.query.limit) || 45)

    const base = db.selectOne('SELECT positive_prompt, img_embed, img_embed_model FROM generations WHERE id = ?', [id])
    if (!base) return res.status(404).json({ error: 'Image not found' })

    const baseTags = splitSets(base.positive_prompt)
    const hasBaseTags = baseTags.pose.size > 0 || baseTags.char.size > 0
    const baseVec = base.img_embed ? emb.fromBase64(base.img_embed) : null

    // Pose-first mode needs tags; if the base has none, fall back to pure visual.
    if (!hasBaseTags) {
      if (!baseVec) return res.status(400).json({ error: 'That image has no tags and is not indexed for visual search yet' })
      const rows = db.selectAll('SELECT * FROM generations WHERE img_embed != \'\' AND img_embed_model = ? AND id != ?', [base.img_embed_model, id])
      const scored = []
      for (const r of rows) {
        try { const sc = emb.cosine(baseVec, emb.fromBase64(r.img_embed)); if (sc >= 0.89) scored.push({ r, score: sc }) } catch { /* skip */ }
      }
      return res.json(pageOut(scored, page, limit))
    }

    const POSE_MIN = 0.6 // must share at least ~60% of pose/clothing/scene tags
    const rows = db.selectAll('SELECT * FROM generations WHERE id != ?', [id])
    const scored = []
    for (const r of rows) {
      const t = splitSets(r.positive_prompt)
      const poseSim = jaccard(baseTags.pose, t.pose)
      if (poseSim < POSE_MIN) continue // different pose/scene -> skip
      const charSim = jaccard(baseTags.char, t.char)
      let visual = null
      if (baseVec && r.img_embed) { try { visual = emb.cosine(baseVec, emb.fromBase64(r.img_embed)) } catch { visual = null } }
      // Weights: pose dominates, character second, visual a light tiebreaker.
      // Identical (same pose + same character) ranks above same-pose/other-character.
      const score = visual != null
        ? 0.55 * poseSim + 0.15 * charSim + 0.30 * visual
        : 0.65 * poseSim + 0.35 * charSim
      scored.push({ r, score })
    }
    scored.sort((a, b) => b.score - a.score)
    res.json(pageOut(scored, page, limit))
  } catch (err) { next(err) }
}

function pageOut(scored, page, limit) {
  const total = scored.length
  const start = (page - 1) * limit
  const items = scored.slice(start, start + limit).map((s) => ({ ...history.shape(s.r), score: Number(s.score.toFixed(3)) }))
  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

module.exports = { imgStatus, imgPending, saveImgEmbed, similar }
