// ComfyUI client: auto-detects the running instance, queues workflows,
// polls for results, downloads images, and supports cancellation + VRAM free.

const fetch = require('node-fetch')
const FormData = require('form-data')
const WebSocket = require('ws')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const GENERATED_DIR = path.resolve(__dirname, '../../../generated')
const THUMBS_DIR = path.resolve(__dirname, '../../../thumbnails')
const TAGGER_WORKFLOW = path.resolve(__dirname, '../../../config/tagger/TAGS_API.json')
const cfg = require('../config')

// Reads the REAL pixel dimensions of a saved image from its header. This matters
// because a workflow may upscale internally, so the file on disk is larger than
// the latent/EmptyLatentImage size the user requested. Supports PNG and JPEG.
// Returns { w, h } or { w: 0, h: 0 } if it can't be read.
function imageSize(absPath) {
  try {
    const fd = fs.openSync(absPath, 'r')
    const buf = Buffer.alloc(65536)
    const read = fs.readSync(fd, buf, 0, 65536, 0)
    fs.closeSync(fd)
    // PNG: signature then IHDR with width@16, height@20 (big-endian).
    if (buf.toString('ascii', 1, 4) === 'PNG') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    }
    // JPEG: scan segments for a Start-Of-Frame marker (C0..CF except C4/C8/CC).
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2
      while (o + 9 < read) {
        if (buf[o] !== 0xff) { o++; continue }
        const m = buf[o + 1]
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) }
        }
        o += 2 + buf.readUInt16BE(o + 2)
      }
    }
  } catch { /* ignore */ }
  return { w: 0, h: 0 }
}
const CANDIDATE_PORTS = cfg.COMFYUI_PORTS

// One stable client id for the whole backend process, shared by the prompt
// queue and the progress websocket so progress events match our jobs.
const CLIENT_ID = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')

// Live progress, updated by the websocket listener. Reported as ONE overall
// percentage across the whole graph (executed nodes + current node fraction),
// monotonic within an image so it never jumps back to 0 per node.
const progress = {
  value: 0,
  max: 0,
  percent: 0,
  node: null,
  executed: 0,
  totalNodes: 0,
  prevPercent: 0,
  image: 0,
  total: 0,
  active: false
}
let seenNodes = new Set()
let ws = null

function recomputePercent() {
  const total = progress.totalNodes || 1
  const frac = progress.max ? progress.value / progress.max : 0
  let overall = ((progress.executed - 1) + frac) / total
  overall = Math.max(0, Math.min(1, overall))
  let pct = Math.round(overall * 100)
  pct = Math.max(progress.prevPercent, pct) // monotonic within the image
  progress.prevPercent = pct
  progress.percent = pct
}

function setBatch(image, total) {
  progress.image = image
  progress.total = total
}

function setTotalNodes(n) {
  progress.totalNodes = n || 0
}

function resetProgress(active) {
  progress.value = 0
  progress.max = 0
  progress.percent = 0
  progress.prevPercent = 0
  progress.executed = 0
  progress.node = null
  progress.active = !!active
  seenNodes = new Set()
}

function getProgress() {
  return { ...progress }
}

// Connects (once) to ComfyUI's websocket to receive step progress.
async function ensureProgressSocket() {
  const url = await detectUrl()
  if (!url) return
  if (ws && ws.readyState === WebSocket.OPEN) return
  try {
    const wsUrl = url.replace(/^http/, 'ws') + `/ws?clientId=${CLIENT_ID}`
    ws = new WebSocket(wsUrl)
    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (!msg || !msg.type) return
      if (msg.type === 'progress' && msg.data) {
        progress.value = msg.data.value || 0
        progress.max = msg.data.max || 0
        recomputePercent()
      } else if (msg.type === 'executing' && msg.data) {
        const node = msg.data.node
        if (node != null) {
          if (!seenNodes.has(node)) { seenNodes.add(node); progress.executed = seenNodes.size }
          progress.node = node
          progress.value = 0; progress.max = 0
          recomputePercent()
        } else {
          progress.node = null
        }
      }
    })
    ws.on('close', () => { ws = null })
    ws.on('error', () => { ws = null })
  } catch {
    ws = null
  }
}

let cachedUrl = cfg.COMFYUI_URL

async function ping(url) {
  try {
    const res = await fetch(`${url}/system_stats`, { timeout: 2500 })
    return res.ok
  } catch {
    return false
  }
}

// Returns the working base URL or null. Caches the result.
async function detectUrl(force = false) {
  if (cachedUrl && !force) {
    if (await ping(cachedUrl)) return cachedUrl
  }
  if (cfg.COMFYUI_URL && (await ping(cfg.COMFYUI_URL))) {
    cachedUrl = cfg.COMFYUI_URL
    return cachedUrl
  }
  for (const port of CANDIDATE_PORTS) {
    const url = `http://127.0.0.1:${port}`
    if (await ping(url)) {
      cachedUrl = url
      return cachedUrl
    }
  }
  cachedUrl = null
  return null
}

async function isConnected() {
  return (await detectUrl()) !== null
}

async function getObjectInfo() {
  const url = await detectUrl()
  if (!url) throw new Error('ComfyUI not running')
  const res = await fetch(`${url}/object_info`)
  if (!res.ok) throw new Error(`ComfyUI /object_info ${res.status}`)
  return res.json()
}

// Lists the values of a combo input on a given node class (checkpoints, loras).
async function listComboValues(classType, inputName) {
  try {
    const info = await getObjectInfo()
    const node = info[classType]
    const opt = node && node.input && (node.input.required || node.input.optional)
    const field = opt && opt[inputName]
    if (Array.isArray(field) && Array.isArray(field[0])) return field[0]
    return []
  } catch {
    return []
  }
}

async function listCheckpoints() {
  return listComboValues('CheckpointLoaderSimple', 'ckpt_name')
}

async function listLoras() {
  return listComboValues('LoraLoader', 'lora_name')
}

let activePromptId = null

async function queuePrompt(workflow) {
  const url = await detectUrl()
  if (!url) throw new Error('ComfyUI not running')
  await ensureProgressSocket()
  const res = await fetch(`${url}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: CLIENT_ID })
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`ComfyUI /prompt ${res.status}: ${txt.slice(0, 300)}`)
  }
  const data = await res.json()
  activePromptId = data.prompt_id
  return data.prompt_id
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Polls /history/{id} until the prompt finishes or is cancelled.
async function waitForResult(promptId, { timeoutMs = 600000, intervalMs = 1000 } = {}) {
  const url = await detectUrl()
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (activePromptId === null) return { cancelled: true, outputs: null }
    const res = await fetch(`${url}/history/${promptId}`)
    if (res.ok) {
      const hist = await res.json()
      if (hist[promptId]) {
        const status = hist[promptId].status
        if (!status || status.completed || status.status_str === 'success') {
          return { cancelled: false, outputs: hist[promptId].outputs || {} }
        }
        if (status.status_str === 'error') {
          throw new Error('ComfyUI reported an error during generation')
        }
      }
    }
    await sleep(intervalMs)
  }
  throw new Error('ComfyUI generation timed out')
}

// Downloads one image described by a /history output entry.
async function downloadImage(imageInfo, destPath) {
  const url = await detectUrl()
  const params = new URLSearchParams({
    filename: imageInfo.filename,
    subfolder: imageInfo.subfolder || '',
    type: imageInfo.type || 'output'
  })
  const res = await fetch(`${url}/view?${params.toString()}`)
  if (!res.ok) throw new Error(`ComfyUI /view ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buf)
  return buf
}

function dateFolders() {
  const now = new Date()
  const y = String(now.getFullYear())
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const dir = path.join(GENERATED_DIR, y, m, d)
  fs.mkdirSync(dir, { recursive: true })
  return { dir, y, m, d }
}

// Runs a workflow end to end, returns saved image descriptors.
// onImage(absPath) is optional, called per saved image.
async function generate(workflow) {
  setTotalNodes(Object.keys(workflow || {}).length)
  const promptId = await queuePrompt(workflow)
  const { cancelled, outputs } = await waitForResult(promptId)
  if (cancelled) return { cancelled: true, images: [] }
  // Mark this image complete so the bar fills cleanly.
  progress.executed = progress.totalNodes
  progress.value = 0; progress.max = 0; progress.prevPercent = 100; progress.percent = 100

  const saved = []
  const { dir } = dateFolders()
  for (const nodeId of Object.keys(outputs || {})) {
    const out = outputs[nodeId]
    if (!out.images) continue
    for (const img of out.images) {
      if (img.type === 'temp') continue
      const stamp = Date.now() + '_' + Math.random().toString(36).slice(2, 7)
      const ext = path.extname(img.filename) || '.png'
      const filename = `img_${stamp}${ext}`
      const absPath = path.join(dir, filename)
      await downloadImage(img, absPath)
      // No inline thumbnail anymore. The browser optimizer creates a small
      // thumbnail under the separate thumbnails/ folder, keeping generated/ as
      // pristine originals (so migrating the folder never duplicates _thumb).
      // Read the REAL size from the file (a workflow may upscale internally).
      const sz = imageSize(absPath)
      saved.push({ imagePath: absPath, thumbPath: absPath, width: sz.w, height: sz.h })
    }
  }
  return { cancelled: false, images: saved }
}

// Uploads an image to ComfyUI's input folder, returns the stored filename.
async function uploadImage(buffer, filename) {
  const url = await detectUrl()
  if (!url) throw new Error('ComfyUI not running')
  const form = new FormData()
  form.append('image', buffer, { filename: filename || `swap_${Date.now()}.png` })
  form.append('overwrite', 'true')
  const res = await fetch(`${url}/upload/image`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`ComfyUI /upload/image ${res.status}`)
  const data = await res.json()
  return data.name || filename
}

// Pulls a usable text/tag string out of a /history outputs object.
function extractTagText(outputs) {
  const collect = (val) => {
    if (typeof val === 'string') return val
    if (Array.isArray(val)) return val.map(collect).filter(Boolean).join(', ')
    if (val && typeof val === 'object') {
      for (const key of ['tags', 'text', 'string', 'value']) {
        if (val[key] != null) return collect(val[key])
      }
    }
    return ''
  }
  const ids = Object.keys(outputs || {})
  for (const id of ids) {
    const out = outputs[id]
    for (const key of ['tags', 'text', 'string']) {
      if (out && out[key] != null) {
        const t = collect(out[key])
        if (t && t.trim()) return t.trim()
      }
    }
  }
  for (const id of ids) {
    const t = collect(outputs[id])
    if (t && t.trim()) return t.trim()
  }
  return ''
}

// Runs the WD14 tagger workflow on an uploaded image, returns the tag string.
async function tagImage(buffer, filename, opts = {}) {
  const url = await detectUrl()
  if (!url) throw new Error('ComfyUI not running')
  if (!fs.existsSync(TAGGER_WORKFLOW)) throw new Error('Tagger workflow missing (config/tagger/TAGS_API.json)')

  const storedName = await uploadImage(buffer, filename)
  const wf = JSON.parse(fs.readFileSync(TAGGER_WORKFLOW, 'utf8'))

  for (const id of Object.keys(wf)) {
    const node = wf[id]
    if (node.class_type === 'LoadImage') node.inputs.image = storedName
    if (node.class_type === 'WD14Tagger|pysssss') {
      if (opts.model) node.inputs.model = opts.model
      if (opts.threshold != null) node.inputs.threshold = Number(opts.threshold)
      if (opts.charThreshold != null) node.inputs.character_threshold = Number(opts.charThreshold)
    }
  }

  const promptId = await queuePrompt(wf)
  const { cancelled, outputs } = await waitForResult(promptId, { timeoutMs: 120000 })
  if (cancelled) throw new Error('Tagging cancelled')
  const tags = extractTagText(outputs)
  if (!tags) throw new Error('Tagger returned no text. Check the WD14 node output in ComfyUI.')
  return tags
}

async function interrupt() {
  const url = await detectUrl()
  if (!url) return false
  activePromptId = null
  try {
    await fetch(`${url}/interrupt`, { method: 'POST' })
    return true
  } catch {
    return false
  }
}

const UPSCALE_WORKFLOW = path.resolve(__dirname, '../../../config/upscale/UPSCALE_API.json')

// Upscales an image through ComfyUI (RealESRGAN anime model from the workflow).
// Uploads the image, runs the upscale graph, saves the result under generated/.
async function upscale(buffer, filename) {
  const url = await detectUrl()
  if (!url) throw new Error('ComfyUI not running')
  const name = await uploadImage(buffer, filename || `upscale_${Date.now()}.png`)

  const wf = JSON.parse(fs.readFileSync(UPSCALE_WORKFLOW, 'utf8'))
  // Point the LoadImage node (id "5") at the uploaded file.
  const loadNode = Object.keys(wf).find((k) => wf[k] && wf[k].class_type === 'LoadImage')
  if (!loadNode) throw new Error('Upscale workflow has no LoadImage node')
  wf[loadNode].inputs.image = name

  resetProgress(true)
  const out = await generate(wf)
  resetProgress(false)
  if (out.cancelled) return { cancelled: true, image: null }
  if (!out.images.length) throw new Error('Upscale produced no image')
  return { cancelled: false, image: out.images[0].imagePath }
}

module.exports = {
  detectUrl,
  isConnected,
  listCheckpoints,
  listLoras,
  generate,
  tagImage,
  upscale,
  interrupt,
  imageSize,
  getProgress,
  setBatch,
  resetProgress,
  GENERATED_DIR,
  THUMBS_DIR
}
