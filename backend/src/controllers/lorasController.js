// /api/loras  and  /api/loras/supports

const fs = require('fs')
const path = require('path')
const comfyui = require('../services/comfyui')
const workflows = require('../services/workflows')

const PREVIEWS_DIR = path.resolve(__dirname, '../../../config/loras-previews')
const PREVIEW_EXTS = ['.png', '.jpg', '.jpeg', '.webp']

function previewFor(loraName) {
  // Match by base name (strip folders and extension of the .safetensors).
  const base = path.basename(loraName).replace(/\.safetensors$/i, '')
  if (!fs.existsSync(PREVIEWS_DIR)) return null
  for (const ext of PREVIEW_EXTS) {
    const candidate = `${base}${ext}`
    if (fs.existsSync(path.join(PREVIEWS_DIR, candidate))) {
      return `/loras-previews/${candidate}`
    }
  }
  return null
}

async function list(req, res, next) {
  try {
    const loras = await comfyui.listLoras()
    res.json({
      items: loras.map((name) => ({
        name,
        preview: previewFor(name)
      }))
    })
  } catch (err) {
    next(err)
  }
}

function supports(req, res, next) {
  try {
    const wf = req.query.workflow || 'workflow_api_clean_v3'
    res.json({ supports: workflows.workflowSupportsLora(wf) })
  } catch (err) {
    next(err)
  }
}

module.exports = { list, supports }
