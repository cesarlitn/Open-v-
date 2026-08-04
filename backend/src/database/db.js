// Database layer: SQLite through sql.js (WebAssembly, no native build needed).
// The whole DB lives in memory and is flushed to database/studio.db after writes.

const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

const DB_DIR = path.resolve(__dirname, '../../../database')
const DB_FILE = path.join(DB_DIR, 'studio.db')

let SQL = null
let db = null

function persist() {
  if (!db) return
  const data = db.export()
  fs.writeFileSync(DB_FILE, Buffer.from(data))
}

function columnExists(table, col) {
  const res = db.exec(`PRAGMA table_info(${table})`)
  if (!res.length) return false
  return res[0].values.some((row) => row[1] === col)
}

function ensureColumn(table, col, ddl) {
  if (!columnExists(table, col)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER,
      image_path TEXT NOT NULL,
      thumbnail_path TEXT,
      mode TEXT DEFAULT 'SFW',
      checkpoint TEXT,
      positive_prompt TEXT,
      negative_prompt TEXT,
      width INTEGER,
      height INTEGER,
      created_at TEXT,
      favorite INTEGER DEFAULT 0
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      facebook_connected INTEGER DEFAULT 0,
      instagram_connected INTEGER DEFAULT 0,
      hashtags_default TEXT DEFAULT '',
      last_checkpoint TEXT DEFAULT '',
      last_workflow TEXT DEFAULT '',
      last_width INTEGER DEFAULT 1024,
      last_height INTEGER DEFAULT 1024,
      last_quantity INTEGER DEFAULT 1,
      comfyui_url TEXT DEFAULT '',
      contain_mode INTEGER DEFAULT 0,
      ollama_model TEXT DEFAULT '',
      wd14_model TEXT DEFAULT 'wd-v1-4-moat-tagger-v2',
      wd14_threshold REAL DEFAULT 0.4,
      wd14_char_threshold REAL DEFAULT 0.85,
      llm_provider TEXT DEFAULT '',
      llm_model TEXT DEFAULT '',
      llm_api_key TEXT DEFAULT ''
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS poses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      prompt TEXT DEFAULT '',
      preview_path TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      franchise TEXT DEFAULT '',
      target_profile TEXT DEFAULT '',
      hair TEXT DEFAULT '',
      eyes TEXT DEFAULT '',
      species_traits TEXT DEFAULT '',
      clothing TEXT DEFAULT '',
      accessories TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      preview_path TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );
  `)

  // Forward-compatible migrations (no-op if columns already exist).
  ensureColumn('generations', 'mode', "mode TEXT DEFAULT 'SFW'")
  ensureColumn('generations', 'favorite', 'favorite INTEGER DEFAULT 0')
  ensureColumn('settings', 'ollama_model', "ollama_model TEXT DEFAULT ''")
  ensureColumn('settings', 'contain_mode', 'contain_mode INTEGER DEFAULT 0')
  ensureColumn('generations', 'thumb_opt', 'thumb_opt INTEGER DEFAULT 0')
  ensureColumn('generations', 'img_embed', "img_embed TEXT DEFAULT ''")
  ensureColumn('generations', 'img_embed_model', "img_embed_model TEXT DEFAULT ''")
  ensureColumn('settings', 'last_workflow', "last_workflow TEXT DEFAULT ''")
  ensureColumn('settings', 'last_width', 'last_width INTEGER DEFAULT 1024')
  ensureColumn('settings', 'last_height', 'last_height INTEGER DEFAULT 1024')
  ensureColumn('settings', 'last_quantity', 'last_quantity INTEGER DEFAULT 1')
  ensureColumn('settings', 'wd14_model', "wd14_model TEXT DEFAULT 'wd-v1-4-moat-tagger-v2'")
  ensureColumn('settings', 'wd14_threshold', 'wd14_threshold REAL DEFAULT 0.4')
  ensureColumn('settings', 'wd14_char_threshold', 'wd14_char_threshold REAL DEFAULT 0.85')
  ensureColumn('settings', 'llm_provider', "llm_provider TEXT DEFAULT ''")
  ensureColumn('settings', 'llm_model', "llm_model TEXT DEFAULT ''")
  ensureColumn('settings', 'llm_api_key', "llm_api_key TEXT DEFAULT ''")
  ensureColumn('settings', 'fb_page_id', "fb_page_id TEXT DEFAULT ''")
  ensureColumn('settings', 'fb_token', "fb_token TEXT DEFAULT ''")
  ensureColumn('settings', 'ig_user_id', "ig_user_id TEXT DEFAULT ''")

  const row = selectOne('SELECT id FROM settings WHERE id = 1')
  if (!row) {
    db.run('INSERT INTO settings (id) VALUES (1)')
  }
  persist()
}

async function init() {
  if (db) return db
  SQL = await initSqlJs({
    // sql.js ships the wasm next to its dist; resolve it so Node can find it.
    locateFile: (file) =>
      path.join(path.dirname(require.resolve('sql.js')), file)
  })

  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true })

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }
  createSchema()
  return db
}

// --- helpers -------------------------------------------------------------

function run(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  stmt.step()
  stmt.free()
  // last_insert_rowid for INSERTs.
  const res = db.exec('SELECT last_insert_rowid() AS id')
  const id = res.length ? res[0].values[0][0] : null
  persist()
  return { lastID: id }
}

function selectOne(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  let out = null
  if (stmt.step()) out = stmt.getAsObject()
  stmt.free()
  return out
}

function selectAll(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

// Like run() but does NOT flush to disk - for bulk operations. Call persist() once after.
function runQuiet(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  stmt.step()
  stmt.free()
}

module.exports = { init, run, runQuiet, selectOne, selectAll, persist }
