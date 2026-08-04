// LLM service. Supports LOCAL providers (Ollama, LM Studio, llama.cpp) detected
// automatically, and CLOUD providers (Claude, DeepSeek, Gemini, OpenAI) via an
// API key the user pastes in Settings. Used by the Poses tab (pose filter).

const fetch = require('node-fetch')
const cfg = require('../config')

const LOCAL = [
  { id: 'ollama', label: 'Ollama', base: cfg.OLLAMA_URL, type: 'ollama' },
  { id: 'lmstudio', label: 'LM Studio', base: cfg.LMSTUDIO_URL, type: 'openai' },
  { id: 'llamacpp', label: 'llama.cpp', base: cfg.LLAMACPP_URL, type: 'openai' }
]

// Cloud providers + a few suggested models (user can also type a custom one).
const CLOUD = {
  anthropic: { label: 'Claude (Anthropic)', models: ['claude-sonnet-4-5', 'claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'] },
  deepseek: { label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
  gemini: { label: 'Gemini (Google)', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  openai: { label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] }
}

function isCloud(provider) {
  return Object.prototype.hasOwnProperty.call(CLOUD, provider)
}
function cloudOptions() {
  return Object.keys(CLOUD).map((id) => ({ id, label: CLOUD[id].label, models: CLOUD[id].models }))
}

function timeoutFetch(url, opts = {}, ms = 3000) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ])
}

async function listOllama(p) {
  const res = await timeoutFetch(`${p.base}/api/tags`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.models || []).map((m) => m.name)
}
async function listOpenAI(p) {
  const res = await timeoutFetch(`${p.base}/models`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.data || []).map((m) => m.id)
}

// Detected LOCAL models only.
async function listModels() {
  const out = []
  for (const p of LOCAL) {
    try {
      const names = p.type === 'ollama' ? await listOllama(p) : await listOpenAI(p)
      for (const name of names) out.push({ id: `${p.id}::${name}`, provider: p.id, model: name, label: `${name}  -  ${p.label}` })
    } catch { /* not running */ }
  }
  return out
}

async function providerStatus() {
  const status = {}
  for (const p of LOCAL) {
    try {
      const names = p.type === 'ollama' ? await listOllama(p) : await listOpenAI(p)
      status[p.id] = { label: p.label, connected: true, count: names.length }
    } catch {
      status[p.id] = { label: p.label, connected: false, count: 0 }
    }
  }
  return status
}

async function chatLocal(p, { model, system, user, temperature }) {
  if (p.type === 'ollama') {
    const res = await fetch(`${p.base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false, options: { temperature } })
    })
    if (!res.ok) throw new Error(`Ollama chat ${res.status}`)
    const data = await res.json()
    return (data.message && data.message.content) || ''
  }
  const res = await fetch(`${p.base}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, stream: false })
  })
  if (!res.ok) throw new Error(`${p.label} chat ${res.status}`)
  const data = await res.json()
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
}

async function chatCloud(provider, { model, system, user, temperature, apiKey }) {
  if (!apiKey) throw new Error(`${CLOUD[provider].label}: no API key set in Settings`)

  if (provider === 'anthropic') {
    const res = await fetch(cfg.ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: 'user', content: user }] })
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 160)}`)
    const data = await res.json()
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  }

  if (provider === 'gemini') {
    const url = `${cfg.GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature }
      })
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`)
    const data = await res.json()
    const cand = data.candidates && data.candidates[0]
    return ((cand && cand.content && cand.content.parts) || []).map((part) => part.text).join('\n')
  }

  // deepseek + openai are OpenAI-compatible
  const base = provider === 'deepseek' ? cfg.DEEPSEEK_API_BASE : cfg.OPENAI_API_BASE
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, stream: false })
  })
  if (!res.ok) throw new Error(`${CLOUD[provider].label} ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const data = await res.json()
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
}

async function chat({ provider, model, system, user, temperature = 0.2, apiKey = '' }) {
  if (!model) throw new Error('No LLM model selected')
  if (isCloud(provider)) return chatCloud(provider, { model, system, user, temperature, apiKey })
  const p = LOCAL.find((x) => x.id === provider)
  if (!p) throw new Error(`Unknown LLM provider: ${provider}`)
  return chatLocal(p, { model, system, user, temperature })
}

function extractLabel(text, label) {
  const lines = String(text || '').split('\n')
  const re = new RegExp(`^\\s*[#>*\\-\\s]*${label}\\s*[:\\u2014\\-]\\s*`, 'i')
  const collected = []
  let capturing = false
  for (const line of lines) {
    if (re.test(line)) { capturing = true; const rest = line.replace(re, '').trim(); if (rest) collected.push(rest); continue }
    if (capturing && /^\s*[#>*\-\s]*[A-Z_]{3,}\s*[:\u2014\-]/.test(line)) break
    if (capturing && line.trim()) collected.push(line.trim())
  }
  return collected.join(', ').replace(/\s*,\s*/g, ', ').replace(/,\s*,/g, ', ').trim()
}

module.exports = { listModels, providerStatus, cloudOptions, chat, extractLabel }
