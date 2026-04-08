const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

const DB_PATH     = path.join(__dirname, 'vtt.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

async function init() {
  const SQL    = await initSqlJs();
  const exists = fs.existsSync(DB_PATH);
  db = exists
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  if (!exists) {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.run(schema);
    save();
  }
}

function save() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function run(sql, params = []) {
  db.run(sql, params);
  const meta = db.exec('SELECT last_insert_rowid() as id, changes() as ch');
  save();
  const row = meta[0]?.values[0];
  return { lastInsertRowid: Number(row?.[0] ?? 0), changes: Number(row?.[1] ?? 0) };
}

function all(sql, params = []) {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  );
}

function get(sql, params = []) {
  return all(sql, params)[0];
}

module.exports = { init, run, all, get };
