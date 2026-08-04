// POST /api/upscale - receives a base64 image, runs the ComfyUI upscale
// workflow (RealESRGAN anime, x4), saves the result and ALSO records it in the
// Generate history so the user can favorite/keep it like any other image.

const path = require('path')
const comfyui = require('../services/comfyui')
const db = require('../database/db')

// Store local Peru time (UTC-5) as "YYYY-MM-DD HH:MM:SS" - same format the rest
// of the history uses, so ordering by created_at stays consistent.
function nowPeru() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

async function upscale(req, res, next) {
  try {
    let { image } = req.body || {}
    if (!image) return res.status(400).json({ error: 'No image provided' })
    image = String(image).replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(image, 'base64')

    const out = await comfyui.upscale(buffer, `upscale_${Date.now()}.png`)
    if (out.cancelled) return res.json({ ok: false, cancelled: true })

    const abs = out.image
    const { w, h } = comfyui.imageSize(abs)

    // Record it in the history (thumbnail_path = image; the browser optimizer
    // builds the small thumbnail later, just like with generated images).
    const { lastID } = db.run(
      `INSERT INTO generations
         (image_path, thumbnail_path, mode, checkpoint, positive_prompt,
          negative_prompt, width, height, created_at, favorite)
       VALUES (?, ?, 'upscale', 'RealESRGAN x4', 'Upscaled (x4)', '', ?, ?, ?, 0)`,
      [abs, abs, Number(w), Number(h), nowPeru()]
    )
    db.persist()

    const rel = path.relative(comfyui.GENERATED_DIR, abs).split(path.sep).join('/')
    res.json({ ok: true, id: lastID, image: `/generated/${rel}` })
  } catch (err) { next(err) }
}

module.exports = { upscale }
