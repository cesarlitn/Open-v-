// HTTP client. Every function returns Promise<data> and throws Error on failure.

async function req(method, url, body, opts = {}) {
  const o = { method, headers: {} }
  if (body !== undefined) {
    o.headers['Content-Type'] = 'application/json'
    o.body = JSON.stringify(body)
  }
  if (opts.signal) o.signal = opts.signal
  const res = await fetch(url, o)
  let data = null
  try { data = await res.json() } catch { /* no body */ }
  if (!res.ok) {
    const msg = (data && data.error) || `${res.status} ${res.statusText}`
    throw new Error(msg)
  }
  return data
}

export const api = {
  // generation
  generate: (payload) => req('POST', '/api/generate', payload),
  cancelGenerate: () => req('POST', '/api/generate/cancel'),
  generateProgress: () => req('GET', '/api/generate/progress'),

  // history
  history: ({ search = '', page = 1, limit = 30 } = {}) =>
    req('GET', `/api/history?search=${encodeURIComponent(search)}&page=${page}&limit=${limit}`),
  favorites: () => req('GET', '/api/history/favorites'),
  toggleFavorite: (id) => req('POST', '/api/history/favorite', { id }),
  saveThumb: (id, thumbBase64) => req('POST', `/api/history/${id}/thumb`, { thumbBase64 }),
  imgStatus: () => req('GET', '/api/embed/img-status'),
  imgPending: (limit = 12) => req('GET', `/api/embed/img-pending?limit=${limit}`),
  saveImgEmbed: (id, vectorB64, model) => req('POST', `/api/history/${id}/imgembed`, { vectorB64, model }),
  similar: ({ id, page = 1, limit = 45 }) =>
    req('GET', `/api/history/similar?id=${id}&page=${page}&limit=${limit}`),
  upscale: (image) => req('POST', '/api/upscale', { image }),

  // Workflow management
  workflowCreate: (name, json) => req('POST', '/api/workflows', { name, json }),
  workflowDelete: (name) => req('DELETE', `/api/workflows/${encodeURIComponent(name)}`),
  deleteImage: (id) => req('DELETE', `/api/history/${id}`),

  // models / workflows / loras
  models: () => req('GET', '/api/models'),
  refreshModels: () => req('POST', '/api/models/refresh'),
  workflows: () => req('GET', '/api/workflows'),
  loras: () => req('GET', '/api/loras'),

  // settings
  getSettings: () => req('GET', '/api/settings'),
  setSettings: (payload) => req('POST', '/api/settings', payload),

  // WD14 tagger + pose filter
  tag: (payload, opts) => req('POST', '/api/tag', payload, opts),
  filterPose: (payload) => req('POST', '/api/filter-pose', payload),
  splitTags: (payload, opts) => req('POST', '/api/split-tags', payload, opts),
  extractPose: (payload) => req('POST', '/api/extract-pose', payload),

  // characters (left library)
  characters: (search = '') => req('GET', `/api/characters?search=${encodeURIComponent(search)}`),
  createCharacter: (payload) => req('POST', '/api/characters', payload),
  updateCharacter: (id, payload) => req('PUT', `/api/characters/${id}`, payload),
  deleteCharacter: (id) => req('DELETE', `/api/characters/${id}`),

  // poses (right library)
  poses: (search = '') => req('GET', `/api/poses?search=${encodeURIComponent(search)}`),
  createPose: (payload) => req('POST', '/api/poses', payload),
  updatePose: (id, payload) => req('PUT', `/api/poses/${id}`, payload),
  deletePose: (id) => req('DELETE', `/api/poses/${id}`),

  // local LLM (pose filter brain)
  llmModels: () => req('GET', '/api/llm/models'),
  llmStatus: () => req('GET', '/api/llm/status'),

  health: () => req('GET', '/api/health')
}

export default api
