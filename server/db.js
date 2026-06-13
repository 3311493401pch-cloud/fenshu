const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // 如果已有数据库文件，加载它
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 建表
  db.run(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_type TEXT NOT NULL DEFAULT 'normal',
      name TEXT NOT NULL,
      qq TEXT NOT NULL DEFAULT '',
      high_math REAL NOT NULL DEFAULT 0,
      theory REAL NOT NULL DEFAULT 0,
      practical REAL NOT NULL DEFAULT 0,
      english REAL NOT NULL DEFAULT 0,
      total_score REAL GENERATED ALWAYS AS (high_math + theory + practical + english) STORED,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_scores_batch_total ON scores(batch_type, total_score DESC)`);

  // 每次操作后自动保存
  saveDb();

  return db;
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// 兼容 better-sqlite3 风格的同步 API
function prepare(sql) {
  let stmt = null;
  return {
    get(...params) {
      db.run(sql, params);
      saveDb();
      const result = db.exec(sql.replace(/\?/g, () => {
        const v = params.shift();
        return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v;
      }));
      // 简化：用实际参数查询
      return null; // 用更简单的方式处理
    },
    all(...params) {
      const rows = [];
      // 手动替换参数
      let idx = 0;
      const filled = sql.replace(/\?/g, () => {
        const v = params[idx++];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      try {
        const result = db.exec(filled);
        if (result.length > 0) {
          const cols = result[0].columns;
          for (const row of result[0].values) {
            const obj = {};
            cols.forEach((col, i) => { obj[col] = row[i]; });
            rows.push(obj);
          }
        }
        saveDb();
      } catch (e) {
        // fallback: try running as a statement
        db.run(filled);
        saveDb();
      }
      return rows;
    },
    run(...params) {
      let idx = 0;
      const filled = sql.replace(/\?/g, () => {
        const v = params[idx++];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      db.run(filled);
      saveDb();
      return {
        lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] || 0,
        changes: db.getRowsModified(),
      };
    },
  };
}

module.exports = { getDb, prepare };
