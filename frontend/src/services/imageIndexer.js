// Indexes pending image embeddings using CLIP in the browser.
// Shared by the Settings button and the automatic indexing on app start.

import api from './api'
import { waitWhileGenerating, isGenerating } from './genGate'

let running = false
export function isIndexing() { return running }

// Loops over pending images, computes each CLIP embedding, and saves it.
// Best-effort: stops quietly if CLIP/WebGPU can't run.
// IMPORTANT: yields the GPU to ComfyUI - it never runs CLIP while a generation
// is in progress (that would slow the sampler down).
export async function indexPendingImages({ onStage, onProgress, shouldStop } = {}) {
  if (running) return { skipped: true }
  running = true
  let done = 0
  let failed = 0
  try {
    const first = await api.imgStatus().catch(() => null)
    if (!first || first.pending === 0) return { done: 0, failed: 0, pending: 0 }

    // Don't even load the model mid-generation.
    await waitWhileGenerating()
    onStage && onStage('Loading CLIP model...')
    const clip = await import('./clip')
    await clip.warmup((s) => onStage && onStage(s))

    let guard = 0
    let lastErr = ''
    for (;;) {
      if (shouldStop && shouldStop()) break
      const batch = await api.imgPending(8)
      const items = batch.items || []
      if (!items.length) break

      let okThisBatch = 0
      for (const it of items) {
        if (shouldStop && shouldStop()) break
        // Cede the GPU: if a generation starts, wait here until it finishes.
        await waitWhileGenerating()
        try {
          const b64 = await clip.imageEmbeddingB64(it.image)
          await api.saveImgEmbed(it.id, b64, batch.model)
          okThisBatch++; done++
          onProgress && onProgress(done)
        } catch (e) { lastErr = e.message; failed++ }
      }
      // A whole batch failing (while not just paused) means the model/GPU is the
      // problem -> stop. If we were paused for generation, that's not a failure.
      if (okThisBatch === 0 && !isGenerating()) return { done, failed, error: lastErr || 'CLIP failed to run' }
      if (++guard > 100000) break
    }
    return { done, failed }
  } catch (e) {
    return { done, failed, error: e.message }
  } finally {
    running = false
  }
}
