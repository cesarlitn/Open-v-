OPEN V v6.19.0 - FINAL RELEASE (local)

Local, single-user web app to generate and manage animated-content character
images with a local ComfyUI + NVIDIA GPU. React (Vite) frontend + Node/Express
backend + SQLite (sql.js) storage. Runs entirely on your machine.

QUICK START
  1. Install Node.js 20.19+ (nodejs.org).
  2. Start ComfyUI so it runs on localhost:8188.
  3. In this folder:
        npm run install:all      (first run needs internet)
        npm run dev
  4. Open http://localhost:5173
  Stop with Ctrl + C in the "npm run dev" window.

CONFIGURATION
  All URLs/ports come from environment variables with safe local defaults.
  To override, copy config/.env.example -> config/.env and edit it.
  User credentials (LLM API keys) are entered in the app's Settings and stored
  locally in the database, never in code or .env.

DATA / MIGRATION
  Images live in generated/ ; thumbnails in thumbnails/ ; everything else in
  database/studio.db . To move to a new machine, copy the generated/ folder;
  the app rebuilds the history and re-indexes on start.

See GUIA_INICIO.txt (Spanish quick start) and HANDOFF.txt (architecture).
