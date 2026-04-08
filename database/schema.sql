CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scenes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL DEFAULT 'Cena sem nome',
  image_url   TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id    INTEGER REFERENCES scenes(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  pos_x       REAL    DEFAULT 0,
  pos_y       REAL    DEFAULT 0,
  size        INTEGER DEFAULT 1,
  color       TEXT    DEFAULT '#e63946'
);

CREATE TABLE IF NOT EXISTS notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL DEFAULT 'Sem título',
  content     TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  message     TEXT    NOT NULL,
  timestamp   TEXT    DEFAULT (datetime('now'))
);
