const express = require('express');
const path    = require('path');
const db      = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* ─── HELPERS ────────────────────────────────────────────── */
function migrate() {
  // Idempotent column additions for existing DBs
  const cols = [
    ['campaigns', 'map_url TEXT'],
    ['campaigns', 'notes TEXT'],
    ['tokens',    'scene_id INTEGER'],
  ];
  cols.forEach(([tbl, col]) => {
    try { db.run(`ALTER TABLE ${tbl} ADD COLUMN ${col}`); } catch(_) {}
  });

  // New tables
  db.run(`CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Cena sem nome',
    image_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Sem título',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
}

/* ─── CAMPAIGNS ─────────────────────────────────────────── */

app.get('/', (req, res) => {
  const campaigns = db.all('SELECT * FROM campaigns ORDER BY created_at DESC');
  res.render('index', { campaigns });
});

app.post('/campaigns', (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const result = db.run(
    'INSERT INTO campaigns (name, description) VALUES (?, ?)',
    [name.trim(), description?.trim() || '']
  );
  res.json({ id: result.lastInsertRowid, name: name.trim(), description: description?.trim() || '' });
});

app.delete('/campaigns/:id', (req, res) => {
  db.run('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ─── SESSION ───────────────────────────────────────────── */

app.get('/session/:id', (req, res) => {
  const campaign = db.get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
  if (!campaign) return res.redirect('/');
  res.render('session', { campaign });
});

/* ─── SCENES ─────────────────────────────────────────────── */

app.get('/campaigns/:id/scenes', (req, res) => {
  const scenes = db.all(
    'SELECT * FROM scenes WHERE campaign_id = ? ORDER BY created_at ASC',
    [req.params.id]
  );
  res.json(scenes);
});

app.post('/campaigns/:id/scenes', (req, res) => {
  const { name, image_url } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  // Deactivate all scenes first if this is set as active
  const result = db.run(
    'INSERT INTO scenes (campaign_id, name, image_url, is_active) VALUES (?, ?, ?, 0)',
    [req.params.id, name.trim(), image_url || null]
  );
  const scene = db.get('SELECT * FROM scenes WHERE id = ?', [result.lastInsertRowid]);
  res.json(scene);
});

// Activate a scene (deactivates all others in the campaign)
app.patch('/campaigns/:cid/scenes/:sid/activate', (req, res) => {
  db.run('UPDATE scenes SET is_active = 0 WHERE campaign_id = ?', [req.params.cid]);
  db.run('UPDATE scenes SET is_active = 1 WHERE id = ?', [req.params.sid]);
  res.json({ ok: true });
});

app.patch('/scenes/:id', (req, res) => {
  const { name, image_url } = req.body;
  const scene = db.get('SELECT * FROM scenes WHERE id = ?', [req.params.id]);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });
  db.run('UPDATE scenes SET name=?, image_url=? WHERE id=?',
    [name ?? scene.name, image_url ?? scene.image_url, req.params.id]);
  res.json({ ok: true });
});

app.delete('/scenes/:id', (req, res) => {
  db.run('DELETE FROM scenes WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ─── TOKENS ─────────────────────────────────────────────── */

// Fetch tokens for a scene (or scene-less tokens for backward compat)
app.get('/campaigns/:id/tokens', (req, res) => {
  const { scene_id } = req.query;
  let tokens;
  if (scene_id) {
    tokens = db.all(
      'SELECT * FROM tokens WHERE campaign_id = ? AND scene_id = ? ORDER BY id ASC',
      [req.params.id, scene_id]
    );
  } else {
    tokens = db.all(
      'SELECT * FROM tokens WHERE campaign_id = ? AND scene_id IS NULL ORDER BY id ASC',
      [req.params.id]
    );
  }
  res.json(tokens);
});

app.post('/tokens', (req, res) => {
  const { campaign_id, scene_id, name, pos_x, pos_y, size, color } = req.body;
  if (!campaign_id || !name?.trim())
    return res.status(400).json({ error: 'campaign_id e name obrigatórios' });
  const result = db.run(
    'INSERT INTO tokens (campaign_id, scene_id, name, pos_x, pos_y, size, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [campaign_id, scene_id || null, name.trim(), pos_x ?? 0, pos_y ?? 0, size ?? 1, color ?? '#e63946']
  );
  const token = db.get('SELECT * FROM tokens WHERE id = ?', [result.lastInsertRowid]);
  res.json(token);
});

app.patch('/tokens/:id', (req, res) => {
  const { pos_x, pos_y, name, color, size } = req.body;
  const token = db.get('SELECT * FROM tokens WHERE id = ?', [req.params.id]);
  if (!token) return res.status(404).json({ error: 'Token não encontrado' });
  db.run('UPDATE tokens SET pos_x=?, pos_y=?, name=?, color=?, size=? WHERE id=?',
    [pos_x ?? token.pos_x, pos_y ?? token.pos_y,
     name  ?? token.name,  color ?? token.color,
     size  ?? token.size,  req.params.id]);
  res.json({ ok: true });
});

app.delete('/tokens/:id', (req, res) => {
  db.run('DELETE FROM tokens WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ─── NOTES ─────────────────────────────────────────────── */

app.get('/campaigns/:id/notes', (req, res) => {
  const notes = db.all(
    'SELECT id, title, substr(content,1,120) as preview, created_at, updated_at FROM notes WHERE campaign_id = ? ORDER BY updated_at DESC',
    [req.params.id]
  );
  res.json(notes);
});

app.get('/notes/:id', (req, res) => {
  const note = db.get('SELECT * FROM notes WHERE id = ?', [req.params.id]);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

app.post('/campaigns/:id/notes', (req, res) => {
  const { title, content } = req.body;
  const result = db.run(
    'INSERT INTO notes (campaign_id, title, content) VALUES (?, ?, ?)',
    [req.params.id, title?.trim() || 'Sem título', content || '']
  );
  const note = db.get('SELECT * FROM notes WHERE id = ?', [result.lastInsertRowid]);
  res.json(note);
});

app.patch('/notes/:id', (req, res) => {
  const { title, content } = req.body;
  const note = db.get('SELECT * FROM notes WHERE id = ?', [req.params.id]);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  db.run(
    "UPDATE notes SET title=?, content=?, updated_at=datetime('now') WHERE id=?",
    [title ?? note.title, content ?? note.content, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/notes/:id', (req, res) => {
  db.run('DELETE FROM notes WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ─── FOG OF WAR ─────────────────────────────────────────── */

app.get('/scenes/:id/fog', (req, res) => {
  const shapes = db.all(
    'SELECT * FROM fog_shapes WHERE scene_id = ? ORDER BY id ASC',
    [req.params.id]
  );
  res.json(shapes);
});

app.post('/scenes/:id/fog', (req, res) => {
  const { x, y, w, h, mode } = req.body;
  const result = db.run(
    'INSERT INTO fog_shapes (scene_id, x, y, w, h, mode) VALUES (?, ?, ?, ?, ?, ?)',
    [req.params.id, x, y, w, h, mode || 'hide']
  );
  res.json({ id: result.lastInsertRowid, ok: true });
});

// Limpa todos os shapes da cena
app.delete('/scenes/:id/fog', (req, res) => {
  db.run('DELETE FROM fog_shapes WHERE scene_id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ─── LOGS ───────────────────────────────────────────────── */

app.get('/campaigns/:id/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const logs  = db.all(
    'SELECT * FROM logs WHERE campaign_id = ? ORDER BY id DESC LIMIT ?',
    [req.params.id, limit]
  );
  res.json(logs);
});

app.post('/campaigns/:id/logs', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  db.run('INSERT INTO logs (campaign_id, message) VALUES (?, ?)', [req.params.id, message]);
  res.json({ ok: true });
});

/* ─── BOOT ──────────────────────────────────────────────── */

db.init().then(() => {
  migrate();
  db.run(`CREATE TABLE IF NOT EXISTS fog_shapes (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    x        REAL NOT NULL,
    y        REAL NOT NULL,
    w        REAL NOT NULL,
    h        REAL NOT NULL,
    mode     TEXT NOT NULL DEFAULT 'hide'
  )`);

  app.listen(PORT, () => {
    console.log(`\n  ⚔  VTT running → http://localhost:${PORT}\n`);
  });
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
