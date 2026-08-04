// Visual (image) embeddings computed IN THE BROWSER with CLIP via transformers.js.
// Uses WebGPU when available (your local GPU / 12 GB), falling back to WASM.
// The model downloads once from the Hugging Face CDN on first use.
//
// We use the explicit CLIPVisionModelWithProjection so we always get the pooled,
// projected 512-d image embedding (the right thing for similarity) - not raw
// per-patch tokens.

// Model id (override with VITE_CLIP_MODEL in a frontend .env if needed).
export const IMG_MODEL = import.meta.env.VITE_CLIP_MODEL || 'Xenova/clip-vit-base-patch16'

let bundlePromise = null

async function load(onStage) {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      onStage && onStage('Loading transformers.js...')
      const t = await import('@huggingface/transformers')
      t.env.allowLocalModels = false
      onStage && onStage('Loading CLIP model (first time downloads it)...')
      const processor = await t.AutoProcessor.from_pretrained(IMG_MODEL)
      let model
      try {
        model = await t.CLIPVisionModelWithProjection.from_pretrained(IMG_MODEL, { device: 'webgpu' })
      } catch {
        model = await t.CLIPVisionModelWithProjection.from_pretrained(IMG_MODEL) // WASM fallback
      }
      return { t, processor, model }
    })()
  }
  return bundlePromise
}

function normalize(f32) {
  let s = 0
  for (let i = 0; i < f32.length; i++) s += f32[i] * f32[i]
  const n = Math.sqrt(s) || 1
  for (let i = 0; i < f32.length; i++) f32[i] /= n
  return f32
}

function toBase64(f32) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  return btoa(bin)
}

function absUrl(url) {
  if (!url) return url
  return url.startsWith('/') ? (window.location.origin + url) : url
}

// Warm up the model (so the first index/search shows a clear loading state).
export async function warmup(onStage) { await load(onStage) }

// Returns the normalized CLIP image embedding for an image URL, as base64.
export async function imageEmbeddingB64(url, onStage) {
  const { t, processor, model } = await load(onStage)
  const image = await t.RawImage.read(absUrl(url))
  const inputs = await processor(image)
  const out = await model(inputs)
  const emb = out.image_embeds || out.pooler_output || out.last_hidden_state
  if (!emb || !emb.data) throw new Error('CLIP returned no image_embeds')
  const f32 = Float32Array.from(emb.data)
  if (!f32.length) throw new Error('Empty image embedding')
  return toBase64(normalize(f32))
}
