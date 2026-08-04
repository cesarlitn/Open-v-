// Workflow management endpoints.
//   GET    /api/workflows         -> list workflows (+ LoRA support)
//   POST   /api/workflows         -> add a new workflow { name, json }
//   DELETE /api/workflows/:name   -> delete a workflow (never the last one)

const workflows = require('../services/workflows')

function list(req, res, next) {
  try {
    const names = workflows.listWorkflows()
    res.json({
      items: names.map((name) => ({
        name,
        supportsLora: workflows.workflowSupportsLora(name)
      }))
    })
  } catch (err) {
    next(err)
  }
}

// Body: { name: string, json: string|object }  (ComfyUI API-format graph)
function create(req, res, next) {
  try {
    const { name, json } = req.body || {}
    const saved = workflows.saveWorkflow(name, json)
    res.json({ ok: true, name: saved })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

function remove(req, res, next) {
  try {
    workflows.deleteWorkflow(req.params.name)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

module.exports = { list, create, remove }
