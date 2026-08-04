// POST /api/tag  - receives a base64 image, returns WD14 tags.

const comfyui = require('../services/comfyui')
const db = require('../database/db')

async function tag(req, res, next) {
  try {
    let { image, model, threshold, charThreshold } = req.body || {}
    if (!image) return res.status(400).json({ error: 'No image provided' })
    image = String(image).replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(image, 'base64')

    // Fall back to saved WD14 settings.
    const s = db.selectOne('SELECT wd14_model, wd14_threshold, wd14_char_threshold FROM settings WHERE id = 1') || {}
    const opts = {
      model: model || s.wd14_model || 'wd-v1-4-moat-tagger-v2',
      threshold: threshold != null ? threshold : s.wd14_threshold,
      charThreshold: charThreshold != null ? charThreshold : s.wd14_char_threshold
    }

    const tags = await comfyui.tagImage(buffer, `tag_${Date.now()}.png`, opts)
    res.json({ ok: true, tags })
  } catch (err) {
    next(err)
  }
}

module.exports = { tag }
