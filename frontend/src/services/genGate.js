// ============================================================================
//  genGate.js - Coordinates GPU use between image GENERATION (ComfyUI) and the
//  in-browser VISUAL INDEXER (CLIP/WebGPU). Both want the same physical GPU, so
//  running them at once makes generation noticeably slower.
//
//  Rule: while a generation is in progress, the indexer pauses (cedes the GPU).
//  Home flips this flag around every generation; the indexer awaits it.
// ============================================================================

let generating = false
const subscribers = new Set()

// Called by Home at the start/end of a generation.
export function setGenerating(value) {
  const v = !!value
  if (v === generating) return
  generating = v
  subscribers.forEach((fn) => { try { fn(generating) } catch { /* ignore */ } })
}

export function isGenerating() { return generating }

// Subscribe to changes; returns an unsubscribe function.
export function onGenChange(fn) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

// Resolves immediately if idle, otherwise once generation finishes. The indexer
// awaits this before each image so it never competes with the sampler.
export function waitWhileGenerating() {
  if (!generating) return Promise.resolve()
  return new Promise((resolve) => {
    const off = onGenChange((g) => { if (!g) { off(); resolve() } })
  })
}
