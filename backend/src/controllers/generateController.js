// POST /api/generate  and  POST /api/generate/cancel

const path = require('path')
const comfyui = require('../services/comfyui')
const workflows = require('../services/workflows')
const db = require('../database/db')

function nowPeru() {
  // Store local Peru time (UTC-5), formatted YYYY-MM-DD HH:MM:SS.
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

function toUrl(absPath) {
  const rel = path.relative(comfyui.GENERATED_DIR, absPath).split(path.sep).join('/')
  return `/generated/${rel}`
}

async function generate(req, res, next) {
  try {
    const {
      positive = '',
      negative = '',
      checkpoint = '',
      workflow = 'workflow_api_clean_v3',
      width = 1024,
      height = 1024,
      quantity = 1,
      lora = null
    } = req.body || {}

    if (!(await comfyui.isConnected())) {
      return res.status(503).json({ error: 'ComfyUI is not running' })
    }

    const mode = 'SFW'
    const qty = Math.max(1, Math.min(10, Number(quantity) || 1))
    const generationIds = []
    let cancelled = false

    comfyui.resetProgress(true)
    comfyui.setBatch(0, qty)

    // Remember last checkpoint.
    if (checkpoint) {
      db.run('UPDATE settings SET last_checkpoint = ? WHERE id = 1', [checkpoint])
    }

    for (let i = 0; i < qty; i++) {
      comfyui.resetProgress(true)
      comfyui.setBatch(i + 1, qty)
      const wf = workflows.buildWorkflow(workflow, {
        checkpoint,
        positive,
        negative,
        width,
        height,
        batchSize: 1,
        lora
      })
      const result = await comfyui.generate(wf)
      if (result.cancelled) {
        cancelled = true
        break
      }
      for (const img of result.images) {
        const { lastID } = db.run(
          `INSERT INTO generations
             (image_path, thumbnail_path, mode, checkpoint, positive_prompt,
              negative_prompt, width, height, created_at, favorite)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            img.imagePath,
            img.thumbPath,
            mode,
            checkpoint,
            positive,
            negative,
            Number(img.width) || Number(width),
            Number(img.height) || Number(height),
            nowPeru()
          ]
        )
        generationIds.push(lastID)
      }
    }

    res.json({ ok: true, mode, generationIds, cancelled })
  } catch (err) {
    next(err)
  } finally {
    comfyui.resetProgress(false)
  }
}

function progress(req, res) {
  res.json(comfyui.getProgress())
}

async function cancel(req, res, next) {
  try {
    comfyui.resetProgress(false)
    const ok = await comfyui.interrupt()
    res.json({ ok })
  } catch (err) {
    next(err)
  }
}

module.exports = { generate, cancel, progress }
