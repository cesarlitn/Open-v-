// ============================================================================
//  config.js - Single source of truth for environment-driven configuration.
//
//  WHY: keep every URL, port and external endpoint in ONE place, read from
//  environment variables (with sensible local defaults) so nothing is hardcoded
//  across the codebase. Credentials the USER provides (Meta tokens, LLM API
//  keys) are NOT here - those live in the database (Settings), entered at runtime.
//
//  Override any value by setting it in a `.env` file (see `.env.example`) or in
//  the real environment. Example: COMFYUI_URL=http://localhost:8188
// ============================================================================

// Helper: read an env var, falling back to a default when unset/empty.
function env(name, fallback) {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : fallback
}

module.exports = {
  // --- Server ---
  PORT: Number(env('PORT', '3001')),

  // --- ComfyUI (image generation / upscale) ---
  // If COMFYUI_URL is set it is used directly; otherwise we probe these ports.
  COMFYUI_URL: process.env.COMFYUI_URL || null,
  COMFYUI_PORTS: env('COMFYUI_PORTS', '8188,8000,8888,7860')
    .split(',').map((p) => Number(p.trim())).filter(Boolean),

  // --- Local LLM providers (auto-detected; only the URL is configurable) ---
  OLLAMA_URL: env('OLLAMA_URL', 'http://localhost:11434'),
  LMSTUDIO_URL: env('LMSTUDIO_URL', 'http://localhost:1234/v1'),
  LLAMACPP_URL: env('LLAMACPP_URL', 'http://localhost:8080/v1'),

  // --- Cloud LLM API base URLs (keys come from Settings, never from here) ---
  ANTHROPIC_API_URL: env('ANTHROPIC_API_URL', 'https://api.anthropic.com/v1/messages'),
  OPENAI_API_BASE: env('OPENAI_API_BASE', 'https://api.openai.com/v1'),
  DEEPSEEK_API_BASE: env('DEEPSEEK_API_BASE', 'https://api.deepseek.com'),
  GEMINI_API_BASE: env('GEMINI_API_BASE', 'https://generativelanguage.googleapis.com/v1beta'),


  // --- Visual search (CLIP model run in the browser; here only for reporting) ---
  CLIP_MODEL: env('CLIP_MODEL', 'Xenova/clip-vit-base-patch16')
}
