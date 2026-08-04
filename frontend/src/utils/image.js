// Downscale an uploaded image to a max dimension (default 800x800), preserving
// aspect ratio. Returns a Promise<dataURL>. Keeps library thumbnails light so the
// Poses / characters grids don't feel saturated by huge source images.
export function resizeImageFile(file, max = 800, quality = 0.9) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file'))
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Image decode failed'))
      img.onload = () => {
        let { width, height } = img
        if (width <= max && height <= max) { resolve(reader.result); return }
        const scale = Math.min(max / width, max / height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
        try {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)
          // JPEG keeps file size small; fall back to original on failure.
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          resolve(reader.result)
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
