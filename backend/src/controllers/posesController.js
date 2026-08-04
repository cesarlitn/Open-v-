// /api/poses (CRUD) and /api/filter-pose.
// Poses are user-authored: a text prompt + optional reference image.
// filter-pose strips pose/scene tags from WD14 output, keeping only the
// character's permanent appearance (via local LLM, or a regex fallback).

const fs = require('fs')
const path = require('path')
const db = require('../database/db')
const comfyui = require('../services/comfyui')
const llm = require('../services/localllm')

const POSE_DIR = path.join(comfyui.GENERATED_DIR, 'poses')
const PROMPTS_DIR = path.resolve(__dirname, '../../../config/prompts')

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
    prompt: row.prompt || '',
    preview: toUrl(row.preview_path),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function savePreview(previewBase64, id) {
  if (!previewBase64) return ''
  try {
    if (!fs.existsSync(POSE_DIR)) fs.mkdirSync(POSE_DIR, { recursive: true })
    const data = String(previewBase64).replace(/^data:image\/\w+;base64,/, '')
    const abs = path.join(POSE_DIR, `pose_${id}.png`)
    fs.writeFileSync(abs, Buffer.from(data, 'base64'))
    return abs
  } catch {
    return ''
  }
}

function list(req, res, next) {
  try {
    const search = (req.query.search || '').trim()
    const rows = search
      ? db.selectAll('SELECT * FROM poses WHERE name LIKE ? OR prompt LIKE ? ORDER BY name COLLATE NOCASE', [`%${search}%`, `%${search}%`])
      : db.selectAll('SELECT * FROM poses ORDER BY name COLLATE NOCASE')
    res.json({ items: rows.map(shape) })
  } catch (err) { next(err) }
}

function create(req, res, next) {
  try {
    const b = req.body || {}
    if (!b.name || !b.name.trim()) return res.status(400).json({ error: 'Name is required' })
    const now = nowPeru()
    const { lastID } = db.run(
      'INSERT INTO poses (name, prompt, preview_path, created_at, updated_at) VALUES (?, ?, \'\', ?, ?)',
      [b.name.trim(), b.prompt || '', now, now]
    )
    if (b.previewBase64) {
      const abs = savePreview(b.previewBase64, lastID)
      if (abs) db.run('UPDATE poses SET preview_path = ? WHERE id = ?', [abs, lastID])
    }
    res.json({ ok: true, pose: shape(db.selectOne('SELECT * FROM poses WHERE id = ?', [lastID])) })
  } catch (err) { next(err) }
}

function update(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = db.selectOne('SELECT * FROM poses WHERE id = ?', [id])
    if (!existing) return res.status(404).json({ error: 'Not found' })
    const b = req.body || {}
    db.run('UPDATE poses SET name = ?, prompt = ?, updated_at = ? WHERE id = ?', [
      b.name != null ? b.name : existing.name,
      b.prompt != null ? b.prompt : existing.prompt,
      nowPeru(), id
    ])
    if (b.previewBase64) {
      const abs = savePreview(b.previewBase64, id)
      if (abs) db.run('UPDATE poses SET preview_path = ? WHERE id = ?', [abs, id])
    }
    res.json({ ok: true, pose: shape(db.selectOne('SELECT * FROM poses WHERE id = ?', [id])) })
  } catch (err) { next(err) }
}

function remove(req, res, next) {
  try {
    const id = Number(req.params.id)
    const row = db.selectOne('SELECT * FROM poses WHERE id = ?', [id])
    if (!row) return res.status(404).json({ error: 'Not found' })
    try { if (row.preview_path && fs.existsSync(row.preview_path)) fs.unlinkSync(row.preview_path) } catch { /* ignore */ }
    db.run('DELETE FROM poses WHERE id = ?', [id])
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ---- pose filter ----

const DROP_RE = [
  /\b(standing|sitting|sit|lying|kneeling|squatting|crouching|leaning|bent over|on back|on stomach|on side)\b/i,
  /\b(walking|running|jumping|dancing|flying|swimming|holding|pointing|waving|reaching|grabbing|hugging|carrying)\b/i,
  /\b(arms? up|arms? behind|crossed arms|crossed legs|hand on hip|hands? on|looking back|looking at viewer|looking away|looking up|looking down|head tilt)\b/i,
  /\b(smile|smiling|blush|blushing|surprised|angry|sad|crying|open mouth|closed eyes|wink|frown|grin|laughing|expressionless|pout)\b/i,
  /\b(from above|from below|from side|from behind|cowboy shot|close-up|full body|upper body|portrait|wide shot|dutch angle|pov|dynamic angle|foreshortening)\b/i,
  /\b(background|outdoors|indoors|forest|city|beach|sky|night|day|sunset|sunrise|rain|snow|cloud|window|wall|nature|scenery|landscape|street)\b/i,
  /\bbackground\b/i
]

function heuristicFilter(tags) {
  const list = String(tags || '').split(',').map((t) => t.trim()).filter(Boolean)
  return list.filter((t) => !DROP_RE.some((re) => re.test(t))).join(', ')
}

function readGuide(file) {
  try {
    const raw = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf8')
    const m = raw.match(/\[PROMPT_START\]([\s\S]*?)\[PROMPT_END\]/)
    return m ? m[1].trim() : raw
  } catch { return '' }
}

// Local models often skip the "DESCRIPTION:" label and just return tags. Take the
// model's reply, strip markdown/labels, and keep the most tag-like line so local
// LLMs behave the same as the cloud API
function cleanReply(reply) {
  let txt = String(reply || '').replace(/```[a-z]*|```/gi, '').trim()
  txt = txt.replace(/^\s*(DESCRIPTION|POSITIVE|TAGS|RESULT|OUTPUT|POSE)\s*[:\u2014-]\s*/im, '')
  const lines = txt.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return ''
  // pick the line with the most commas (most likely the tag list)
  let best = lines[0], bestC = (best.match(/,/g) || []).length
  for (const l of lines) { const c = (l.match(/,/g) || []).length; if (c > bestC) { best = l; bestC = c } }
  return best.replace(/^\s*[-*>#]+\s*/, '').trim()
}

// Inverse of the character filter: KEEP pose / clothing / scene, DROP the
// character's permanent identity (hair, eyes, face, body, species, names).
const CHAR_DROP_RE = [
  /\bhair\b/i, /\bbangs\b/i, /\bponytail\b|\btwintails\b|\bbun\b|\bbraid\b/i,
  /\beyes?\b/i, /\beyelashes\b|\beyebrows\b|\bpupils\b/i,
  /\bbreasts?\b|\bcleavage\b|\bthighs\b|\bnavel\b|\bcollarbone\b/i,
  /\bskin\b|\bdark skin\b|\bpale skin\b|\btan\b/i,
  /\banimal ears?\b|\bcat ears?\b|\bfox ears?\b|\btail\b|\bhorns?\b|\bwings?\b|\bfangs?\b/i,
  /\bface\b|\bfacial\b|\blips\b|\bnose\b|\bmole\b|\bfreckles\b/i,
  /\btall\b|\bpetite\b|\bslim\b|\bmuscular\b|\bchild\b|\bloli\b|\bmature\b|\bold\b|\byoung\b/i,
  /\bgenshin impact\b|\bhonkai\b|\bfate\b|\bgame cg\b/i
]
function heuristicPoseExtract(tags) {
  const list = String(tags || '').split(',').map((t) => t.trim()).filter(Boolean)
  return list.filter((t) => !CHAR_DROP_RE.some((re) => re.test(t))).join(', ')
}

function llmConfig() {
  const row = db.selectOne('SELECT llm_provider, llm_model, llm_api_key FROM settings WHERE id = 1') || {}
  if (!row.llm_provider || !row.llm_model) return null
  return { provider: row.llm_provider, model: row.llm_model, apiKey: row.llm_api_key || '' }
}

// Character filter: keep only the character's appearance, drop pose/scene.
async function filter(req, res, next) {
  try {
    const { tags = '' } = req.body || {}
    if (!tags.trim()) return res.status(400).json({ error: 'No tags provided' })

    const cfg = llmConfig()
    if (!cfg) return res.json({ ok: true, viaLlm: false, description: heuristicFilter(tags) })

    const system = readGuide('pose_filter.txt')
    const reply = await llm.chat({ provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey, system, user: tags, temperature: 0.1 })
    let description = llm.extractLabel(reply, 'DESCRIPTION') || cleanReply(reply)
    if (!description) description = heuristicFilter(tags)
    res.json({ ok: true, viaLlm: true, description, raw: reply })
  } catch (err) { next(err) }
}

// Pose extractor: keep pose / clothing / scene, drop the character description.
async function extractPose(req, res, next) {
  try {
    const { tags = '' } = req.body || {}
    if (!tags.trim()) return res.status(400).json({ error: 'No tags provided' })

    const cfg = llmConfig()
    if (!cfg) return res.json({ ok: true, viaLlm: false, pose: heuristicPoseExtract(tags) })

    const system = readGuide('pose_extract.txt')
    const reply = await llm.chat({ provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey, system, user: tags, temperature: 0.1 })
    let pose = llm.extractLabel(reply, 'POSE') || cleanReply(reply)
    if (!pose) pose = heuristicPoseExtract(tags)
    res.json({ ok: true, viaLlm: true, pose, raw: reply })
  } catch (err) { next(err) }
}

// Heuristic two-category split (fallback when no LLM selected).
const CAT1_RE = [
  /\(/,                                   // name + franchise, e.g. reze_\(chainsaw_man\)
  /^\d+(girl|boy|other)s?$/i, /^multiple_(girls|boys)$/i,
  /hair|bangs|ponytail|twintails?|sidelocks?|braid|ahoge/i,
  /(^|_)eyes?($|_)|eyelashes|eyebrows|pupils|heterochromia/i,
  /^blush$/i,
  /breasts?|armpits?|cleavage|navel|collarbone|abs/i,
  /(^|_)skin($|_)/i,
  /\b(tall|petite|slim|muscular|mature|loli|young|old|child|curvy|thick)\b/i,
  /mole|freckles|fang|lips|teeth/i
]
function splitHeuristic(tags) {
  const list = String(tags || '').split(',').map((t) => t.trim()).filter(Boolean)
  const character = []
  const outfit = []
  for (const t of list) {
    if (CAT1_RE.some((re) => re.test(t))) character.push(t)
    else outfit.push(t)
  }
  return { character: character.join(', '), outfit: outfit.join(', ') }
}

// Splits the WD14 tags into CHARACTER + OUTFIT (clothing/accessories/pose/scene).
async function splitTags(req, res, next) {
  try {
    const { tags = '' } = req.body || {}
    if (!tags.trim()) return res.status(400).json({ error: 'No tags provided' })

    const cfg = llmConfig()
    if (!cfg) {
      const h = splitHeuristic(tags)
      return res.json({ ok: true, viaLlm: false, ...h })
    }
    const system = readGuide('tag_split.txt')
    const reply = await llm.chat({ provider: cfg.provider, model: cfg.model, apiKey: cfg.apiKey, system, user: tags, temperature: 0.1 })
    let character = llm.extractLabel(reply, 'CHARACTER')
    let outfit = llm.extractLabel(reply, 'OUTFIT')
    if (!character && !outfit) {
      const h = splitHeuristic(tags)
      character = h.character; outfit = h.outfit
    }
    res.json({ ok: true, viaLlm: true, character, outfit, raw: reply })
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, filter, extractPose, splitTags, splitHeuristic }
