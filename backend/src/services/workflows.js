// Workflow service: lists ComfyUI API-format workflows in config/workflows/
// and injects checkpoint / prompts / resolution / batch / LoRA by class_type
// (never by fixed node id, so any graph structure works).

const fs = require('fs')
const path = require('path')

const WORKFLOWS_DIR = path.resolve(__dirname, '../../../config/workflows')

// The workflow used when the request doesn't name one, and shown first in lists.
const DEFAULT_WORKFLOW = 'workflow_api_clean_v3'

function listWorkflows() {
  if (!fs.existsSync(WORKFLOWS_DIR)) return []
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .map((f) => f.replace(/\.json$/i, ''))
    .sort((a, b) => (a === DEFAULT_WORKFLOW ? -1 : b === DEFAULT_WORKFLOW ? 1 : a.localeCompare(b)))
}

function loadWorkflow(name) {
  const file = path.join(WORKFLOWS_DIR, `${name}.json`)
  if (!fs.existsSync(file)) throw new Error(`Workflow not found: ${name}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Numeric-id-sorted entries so node "6" comes before "15".
function sortedNodes(wf) {
  return Object.keys(wf)
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => ({ id, node: wf[id] }))
}

function nodesByClass(wf, classType) {
  return sortedNodes(wf).filter(({ node }) => node.class_type === classType)
}

function workflowSupportsLora(name) {
  try {
    const wf = loadWorkflow(name)
    return nodesByClass(wf, 'LoraLoader').length > 0
  } catch {
    return false
  }
}

// Mutates a fresh copy of the workflow with the user's parameters.
function buildWorkflow(name, params) {
  const {
    checkpoint,
    positive = '',
    negative = '',
    width = 1024,
    height = 1024,
    batchSize = 1,
    lora = null,           // { name, strength }
    seed = null
  } = params

  const wf = loadWorkflow(name)

  // 1. Checkpoint into every CheckpointLoaderSimple.
  if (checkpoint) {
    for (const { node } of nodesByClass(wf, 'CheckpointLoaderSimple')) {
      node.inputs.ckpt_name = checkpoint
    }
  }

  // 2. Resolution + batch into every EmptyLatentImage.
  for (const { node } of nodesByClass(wf, 'EmptyLatentImage')) {
    node.inputs.width = Number(width)
    node.inputs.height = Number(height)
    node.inputs.batch_size = Number(batchSize)
  }

  // 3. Prompts into CLIPTextEncode: even occurrence = positive, odd = negative.
  const clips = nodesByClass(wf, 'CLIPTextEncode')
  clips.forEach(({ node }, idx) => {
    node.inputs.text = idx % 2 === 0 ? positive : negative
  })

  // 4. LoRA into LoraLoader nodes (optional).
  const loraNodes = nodesByClass(wf, 'LoraLoader')
  if (lora && lora.name && loraNodes.length) {
    for (const { node } of loraNodes) {
      node.inputs.lora_name = lora.name
      const s = typeof lora.strength === 'number' ? lora.strength : 1.0
      node.inputs.strength_model = s
      node.inputs.strength_clip = s
    }
  }

  // 5. Randomize any seed/noise_seed so repeated clicks differ.
  const baseSeed =
    seed != null ? Number(seed) : Math.floor(Math.random() * 1e15)
  let offset = 0
  for (const { node } of sortedNodes(wf)) {
    if (node.inputs && 'seed' in node.inputs) node.inputs.seed = baseSeed + offset++
    if (node.inputs && 'noise_seed' in node.inputs) node.inputs.noise_seed = baseSeed + offset++
  }

  return wf
}

// Sanitizes a user-supplied name into a safe filename (letters, digits, -, _).
function safeName(name) {
  const s = String(name || '').trim().replace(/\.json$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60)
  return s || ''
}

// Validates that a parsed object looks like a ComfyUI API-format graph:
// an object whose values are nodes carrying a class_type.
function isApiGraph(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const keys = Object.keys(obj)
  if (!keys.length) return false
  return keys.every((k) => obj[k] && typeof obj[k] === 'object' && typeof obj[k].class_type === 'string')
}

// Saves a new workflow JSON into config/workflows/<name>.json.
// Accepts the JSON as a string or object. Throws on invalid input.
function saveWorkflow(name, json) {
  const file = safeName(name)
  if (!file) throw new Error('Invalid workflow name')
  let graph = json
  if (typeof graph === 'string') {
    try { graph = JSON.parse(graph) } catch { throw new Error('The JSON is not valid') }
  }
  if (!isApiGraph(graph)) {
    throw new Error('This is not a ComfyUI API-format workflow (export with "Save (API Format)")')
  }
  if (!fs.existsSync(WORKFLOWS_DIR)) fs.mkdirSync(WORKFLOWS_DIR, { recursive: true })
  fs.writeFileSync(path.join(WORKFLOWS_DIR, `${file}.json`), JSON.stringify(graph, null, 2))
  return file
}

// Deletes a workflow file. Refuses to delete the last remaining one so the
// Generate tab always has something to run.
function deleteWorkflow(name) {
  const file = safeName(name)
  if (!file) throw new Error('Invalid workflow name')
  const p = path.join(WORKFLOWS_DIR, `${file}.json`)
  if (!fs.existsSync(p)) throw new Error('Workflow not found')
  if (listWorkflows().length <= 1) throw new Error('Cannot delete the only workflow')
  fs.unlinkSync(p)
}

module.exports = {
  listWorkflows,
  workflowSupportsLora,
  buildWorkflow,
  saveWorkflow,
  deleteWorkflow
}
