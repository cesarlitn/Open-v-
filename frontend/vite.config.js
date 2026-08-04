import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend on 5173, backend on 3001. Proxy /api, /generated, /loras-previews.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/generated': { target: 'http://localhost:3001', changeOrigin: true },
      '/thumbnails': { target: 'http://localhost:3001', changeOrigin: true },
      '/loras-previews': { target: 'http://localhost:3001', changeOrigin: true }
    }
  }
})
