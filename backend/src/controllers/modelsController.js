// /api/models  and  /api/models/refresh

const comfyui = require('../services/comfyui')

async function list(req, res, next) {
  try {
    const items = await comfyui.listCheckpoints()
    res.json({ items })
  } catch (err) {
    next(err)
  }
}

async function refresh(req, res, next) {
  try {
    await comfyui.detectUrl(true)
    const checkpoints = await comfyui.listCheckpoints()
    const loras = await comfyui.listLoras()
    res.json({ ok: true, checkpoints, loras })
  } catch (err) {
    next(err)
  }
}

module.exports = { list, refresh }
