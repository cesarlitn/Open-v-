// /api/llm/models  and  /api/llm/status

const llm = require('../services/localllm')
const db = require('../database/db')

async function models(req, res, next) {
  try {
    const items = await llm.listModels() // detected local models
    const row = db.selectOne('SELECT llm_provider, llm_model, llm_api_key FROM settings WHERE id = 1') || {}
    const selected = row.llm_provider && row.llm_model ? `${row.llm_provider}::${row.llm_model}` : ''
    res.json({
      items,
      cloud: llm.cloudOptions(),
      selected,
      apiKeySet: !!(row.llm_api_key && row.llm_api_key.length)
    })
  } catch (err) { next(err) }
}

async function status(req, res, next) {
  try {
    res.json({ providers: await llm.providerStatus() })
  } catch (err) { next(err) }
}

module.exports = { models, status }
