// All endpoints under /api.

const express = require('express')
const router = express.Router()

const generate = require('../controllers/generateController')
const history = require('../controllers/historyController')
const models = require('../controllers/modelsController')
const workflows = require('../controllers/workflowsController')
const loras = require('../controllers/lorasController')
const settings = require('../controllers/settingsController')
const tag = require('../controllers/tagController')
const characters = require('../controllers/charactersController')
const poses = require('../controllers/posesController')
const llm = require('../controllers/llmController')
const comfyui = require('../services/comfyui')
const localllm = require('../services/localllm')
const pkg = require('../../package.json')

// Generation
router.post('/generate', generate.generate)
router.post('/generate/cancel', generate.cancel)
router.get('/generate/progress', generate.progress)

// History
router.get('/history', history.list)
router.get('/history/favorites', history.favorites)
router.post('/history/favorite', history.toggleFavorite)
router.post('/history/:id/thumb', history.saveThumb)

const embed = require('../controllers/embedController')
router.get('/embed/img-status', embed.imgStatus)
router.get('/embed/img-pending', embed.imgPending)
router.post('/history/:id/imgembed', embed.saveImgEmbed)
router.get('/history/similar', embed.similar)
router.delete('/history/:id', history.remove)

// Models / workflows / loras
router.get('/models', models.list)
router.post('/models/refresh', models.refresh)
router.get('/workflows', workflows.list)
router.post('/workflows', workflows.create)
router.delete('/workflows/:name', workflows.remove)
router.get('/loras', loras.list)
router.get('/loras/supports', loras.supports)


// Settings
router.get('/settings', settings.get)
router.post('/settings', settings.set)

// WD14 Tagger
router.post('/tag', tag.tag)

const upscale = require('../controllers/upscaleController')
router.post('/upscale', upscale.upscale)

// Characters (Poses tab - left library)
router.get('/characters', characters.list)
router.post('/characters', characters.create)
router.put('/characters/:id', characters.update)
router.delete('/characters/:id', characters.remove)

// Poses (Poses tab - right library)
router.get('/poses', poses.list)
router.post('/poses', poses.create)
router.put('/poses/:id', poses.update)
router.delete('/poses/:id', poses.remove)

// Pose filter (LLM strips pose tags, keeps appearance)
router.post('/filter-pose', poses.filter)
router.post('/split-tags', poses.splitTags)
// Pose extractor (LLM keeps pose/clothing/scene, drops the character)
router.post('/extract-pose', poses.extractPose)

// Local LLM discovery (Settings)
router.get('/llm/models', llm.models)
router.get('/llm/status', llm.status)

// Health
router.get('/health', async (req, res) => {
  const comfy = await comfyui.isConnected()
  let llmConnected = false
  try {
    const st = await localllm.providerStatus()
    llmConnected = Object.values(st).some((p) => p.connected)
  } catch { /* ignore */ }
  res.json({ ok: true, backend: true, comfyui: comfy, llm: llmConnected, version: pkg.version })
})

module.exports = router
