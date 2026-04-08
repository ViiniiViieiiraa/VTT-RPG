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
    ['tokens',    'template_id INTEGER'],
    ['tokens',    'current_hp INTEGER'],
    ['tokens',    'max_hp INTEGER'],
    ['tokens',    'conditions TEXT'],
    ['scenes',    'fog_data TEXT'],
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

  db.run(`CREATE TABLE IF NOT EXISTS token_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'npc',
    subcategory TEXT    NOT NULL DEFAULT '1x1',
    color       TEXT    NOT NULL DEFAULT '#9b5de5',
    image_url   TEXT,
    sheet_data  TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
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

/* ─── FOG OF WAR (BRUSH SYSTEM) ─────────────────────────── */

// Busca a imagem da névoa salva na cena
app.get('/scenes/:id/fog', (req, res) => {
  const scene = db.get('SELECT fog_data FROM scenes WHERE id = ?', [req.params.id]);
  if (!scene) return res.status(404).json({ error: 'Cena não encontrada' });
  
  // Retorna o campo fog_data como image_data para o front-end
  res.json({ image_data: scene.fog_data });
});

// Salva o desenho da névoa (Base64) no banco
app.post('/scenes/:id/fog', (req, res) => {
  const { image_data } = req.body;
  
  db.run(
    'UPDATE scenes SET fog_data = ? WHERE id = ?',
    [image_data || null, req.params.id]
  );
  
  res.json({ ok: true });
});

// Opcional: Rota de delete se quiser limpar tudo via API
app.delete('/scenes/:id/fog', (req, res) => {
  db.run('UPDATE scenes SET fog_data = NULL WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

/* ─── TOKEN TEMPLATES ────────────────────────────────────── */

app.get('/campaigns/:id/templates', (req, res) => {
  const rows = db.all(
    'SELECT * FROM token_templates WHERE campaign_id = ? ORDER BY category, name ASC',
    [req.params.id]
  );
  res.json(rows);
});

app.post('/campaigns/:id/templates', (req, res) => {
  const { name, category, subcategory, color, image_url, sheet_data } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const result = db.run(
    'INSERT INTO token_templates (campaign_id,name,category,subcategory,color,image_url,sheet_data) VALUES (?,?,?,?,?,?,?)',
    [req.params.id, name.trim(), category||'npc', subcategory||'1x1',
     color||'#9b5de5', image_url||null, sheet_data ? JSON.stringify(sheet_data) : null]
  );
  const tpl = db.get('SELECT * FROM token_templates WHERE id=?', [result.lastInsertRowid]);
  res.json(tpl);
});

app.patch('/templates/:id', (req, res) => {
  const { name, category, subcategory, color, image_url, sheet_data } = req.body;
  const tpl = db.get('SELECT * FROM token_templates WHERE id=?', [req.params.id]);
  if (!tpl) return res.status(404).json({ error: 'not found' });
  db.run(
    'UPDATE token_templates SET name=?,category=?,subcategory=?,color=?,image_url=?,sheet_data=? WHERE id=?',
    [name??tpl.name, category??tpl.category, subcategory??tpl.subcategory,
     color??tpl.color, image_url??tpl.image_url,
     sheet_data !== undefined ? JSON.stringify(sheet_data) : tpl.sheet_data,
     req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/templates/:id', (req, res) => {
  db.run('DELETE FROM token_templates WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

/* ─── TOKEN INSTANCE — sheet + HP + conditions ───────────── */

app.get('/tokens/:id/sheet', (req, res) => {
  const token = db.get('SELECT * FROM tokens WHERE id=?', [req.params.id]);
  if (!token) return res.status(404).json({ error: 'not found' });
  let sheet = {};
  if (token.template_id) {
    const tpl = db.get('SELECT sheet_data FROM token_templates WHERE id=?', [token.template_id]);
    if (tpl?.sheet_data) try { sheet = JSON.parse(tpl.sheet_data); } catch(_){}
  }
  res.json({
    token,
    sheet,
    current_hp:  token.current_hp,
    max_hp:      token.max_hp,
    conditions:  token.conditions ? JSON.parse(token.conditions) : [],
  });
});

app.patch('/tokens/:id/sheet', (req, res) => {
  const { current_hp, max_hp, conditions, sheet_data } = req.body;
  const token = db.get('SELECT * FROM tokens WHERE id=?', [req.params.id]);
  if (!token) return res.status(404).json({ error: 'not found' });

  // Update instance HP/conditions
  db.run('UPDATE tokens SET current_hp=?,max_hp=?,conditions=? WHERE id=?',
    [current_hp??token.current_hp, max_hp??token.max_hp,
     conditions !== undefined ? JSON.stringify(conditions) : token.conditions,
     req.params.id]);

  // Persist sheet_data back to template if linked
  if (sheet_data && token.template_id) {
    db.run('UPDATE token_templates SET sheet_data=? WHERE id=?',
      [JSON.stringify(sheet_data), token.template_id]);
  }
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

  app.listen(PORT, () => {
    console.log(`\n  ⚔  VTT running → http://localhost:${PORT}\n`);
  });
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
