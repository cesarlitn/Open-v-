// Vector helpers for visual similarity. Image embeddings themselves are computed
// in the browser (CLIP/WebGPU); here we only (de)serialize and compare them.
// Vectors are stored normalized, so cosine == dot product.

function toBase64(f32) {
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64')
}

function fromBase64(b64) {
  const buf = Buffer.from(b64, 'base64')
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
}

function cosine(a, b) {
  const n = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

module.exports = { toBase64, fromBase64, cosine }
