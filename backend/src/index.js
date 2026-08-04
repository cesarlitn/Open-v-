// Entry point. Starts Express on PORT (default 3001), wires static dirs,
// initializes the DB, and pings ComfyUI + Ollama on boot.

const path = require('path')
const fs = require('fs')

// Load config/.env if present (tiny parser, no extra dependency).
;(function loadEnv() {
  const envFile = path.resolve(__dirname, '../../config/.env')
  if (!fs.existsSync(envFile)) return
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
})()

const express = require('express')
const cors = require('cors')

const db = require('./database/db')
const apiRoutes = require('./routes/api')
const errorHandler = require('./middleware/errorHandler')
const comfyui = require('./services/comfyui')
const localllm = require('./services/localllm')

const PORT = require('./config').PORT
const GENERATED_DIR = path.resolve(__dirname, '../../generated')
const THUMBS_DIR = path.resolve(__dirname, '../../thumbnails')
const PREVIEWS_DIR = path.resolve(__dirname, '../../config/loras-previews')

async function main() {
  await db.init()
  const migrate = require('./services/migrate')
  migrate.reanchorPaths()   // fix paths from a copied old DB
  migrate.relocateThumbs()  // move legacy _thumb files into thumbnails/
  migrate.importGenerated() // rebuild history straight from generated/ if needed

  const app = express()
  app.use(cors({ origin: [`http://localhost:5173`, `http://127.0.0.1:5173`] }))
  app.use(express.json({ limit: '30mb' }))

  // Static assets.
  app.use('/generated', express.static(GENERATED_DIR))
  app.use('/thumbnails', express.static(THUMBS_DIR))
  app.use('/loras-previews', express.static(PREVIEWS_DIR))

  app.use('/api', apiRoutes)
  app.use(errorHandler)

  app.listen(PORT, '127.0.0.1', async () => {
    console.log(`\n  Open V backend  -> http://localhost:${PORT}`)
    const comfy = await comfyui.detectUrl()
    console.log('  ComfyUI:', comfy ? `connected (${comfy})` : 'not running')
    try {
      const st = await localllm.providerStatus()
      const up = Object.values(st).filter((p) => p.connected).map((p) => p.label)
      console.log('  LLM    :', up.length ? `connected (${up.join(', ')})` : 'none detected')
    } catch {
      console.log('  LLM    : none detected')
    }
    console.log('')
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
