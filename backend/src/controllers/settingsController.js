// GET /api/settings  and  POST /api/settings

const db = require('../database/db')
const comfyui = require('../services/comfyui')

const FIELDS = [
  'facebook_connected',
  'instagram_connected',
  'hashtags_default',
  'last_checkpoint',
  'last_workflow',
  'last_width',
  'last_height',
  'last_quantity',
  'comfyui_url',
  'contain_mode',
  'ollama_model',
  'wd14_model',
  'wd14_threshold',
  'wd14_char_threshold',
  'llm_provider',
  'llm_model',
  'llm_api_key',
  'fb_page_id',
  'fb_token',
  'ig_user_id'
]

async function get(req, res, next) {
  try {
    const row = db.selectOne('SELECT * FROM settings WHERE id = 1') || {}
    const comfyUrl = await comfyui.detectUrl()
    res.json({
      facebookConnected: !!row.facebook_connected,
      instagramConnected: !!row.instagram_connected,
      hashtagsDefault: row.hashtags_default || '',
      lastCheckpoint: row.last_checkpoint || '',
      lastWorkflow: row.last_workflow || '',
      lastWidth: row.last_width || 1024,
      lastHeight: row.last_height || 1024,
      lastQuantity: row.last_quantity || 1,
      comfyuiUrl: comfyUrl || row.comfyui_url || '',
      containMode: !!row.contain_mode,
      ollamaModel: row.ollama_model || '',
      wd14Model: row.wd14_model || 'wd-v1-4-moat-tagger-v2',
      wd14Threshold: row.wd14_threshold != null ? row.wd14_threshold : 0.4,
      wd14CharThreshold: row.wd14_char_threshold != null ? row.wd14_char_threshold : 0.85,
      llmProvider: row.llm_provider || '',
      llmModel: row.llm_model || '',
      llmApiKeySet: !!(row.llm_api_key && row.llm_api_key.length)
    })
  } catch (err) {
    next(err)
  }
}

function set(req, res, next) {
  try {
    const b = req.body || {}
    const map = {
      facebook_connected: b.facebookConnected,
      instagram_connected: b.instagramConnected,
      hashtags_default: b.hashtagsDefault,
      last_checkpoint: b.lastCheckpoint,
      last_workflow: b.lastWorkflow,
      last_width: b.lastWidth,
      last_height: b.lastHeight,
      last_quantity: b.lastQuantity,
      comfyui_url: b.comfyuiUrl,
      contain_mode: b.containMode,
      ollama_model: b.ollamaModel,
      wd14_model: b.wd14Model,
      wd14_threshold: b.wd14Threshold,
      wd14_char_threshold: b.wd14CharThreshold,
      llm_provider: b.llmProvider,
      llm_model: b.llmModel,
      llm_api_key: b.llmApiKey
    }
    for (const field of FIELDS) {
      if (map[field] === undefined) continue
      let val = map[field]
      if (typeof val === 'boolean') val = val ? 1 : 0
      db.run(`UPDATE settings SET ${field} = ? WHERE id = 1`, [val])
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

module.exports = { get, set }
