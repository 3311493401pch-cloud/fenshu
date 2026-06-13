const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { getDb, prepare } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ====== 管理员配置 ======
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_TOKENS = new Set();

// 生成管理员 token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ====== 管理员登录 ======
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  const token = generateToken();
  ADMIN_TOKENS.add(token);
  res.json({ token });
});

// 管理员鉴权中间件
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !ADMIN_TOKENS.has(token)) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  next();
}

// 等待 DB 就绪的中间件
const ensureDb = (req, res, next) => {
  getDb().then(() => next()).catch(err => res.status(500).json({ error: '数据库未就绪' }));
};

// ====== 成绩提交（公共） ======
app.post('/api/scores', ensureDb, async (req, res) => {

  const { name, qq, high_math, theory, practical, english } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: '请输入真实姓名' });
  }

  const qqStr = String(qq || '').replace(/\D/g, '');
  if (!qqStr) {
    return res.status(400).json({ error: '请输入QQ号' });
  }

  const scores = {
    high_math: parseFloat(high_math),
    theory: parseFloat(theory),
    practical: parseFloat(practical),
    english: parseFloat(english),
  };

  const limits = {
    high_math: { label: '高数', min: 0, max: 150 },
    theory: { label: '理论', min: 0, max: 150 },
    practical: { label: '实操', min: 0, max: 80 },
    english: { label: '外语', min: 0, max: 120 },
  };

  for (const [key, { label, min, max }] of Object.entries(limits)) {
    const v = scores[key];
    if (!Number.isFinite(v)) {
      return res.status(400).json({ error: `请输入${label}成绩` });
    }
    if (v < min || v > max) {
      return res.status(400).json({ error: `${label}成绩范围 ${min}~${max} 分` });
    }
  }

  // 同一 QQ 号在普通批次只能提交一次
  const existing = prepare('SELECT id FROM scores WHERE batch_type = ? AND qq = ?').all('normal', qqStr);
  if (existing.length > 0) {
    return res.status(403).json({ error: '该QQ号已提交过成绩，不可重复提交' });
  }

  const result = prepare(
    'INSERT INTO scores (batch_type, name, qq, high_math, theory, practical, english) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('normal', String(name).trim(), qqStr, scores.high_math, scores.theory, scores.practical, scores.english);

  res.json({ success: true, id: result.lastInsertRowid });
});

// ====== 排行榜查询（公共，匿名化） ======
function maskName(name) {
  if (!name || name.length <= 1) return name || '';
  return name[0] + '*'.repeat(name.length - 1);
}

function maskQQ(qq) {
  if (!qq || qq.length <= 3) return qq || '';
  return qq.slice(0, 3) + '*'.repeat(qq.length - 3);
}

app.get('/api/scores', ensureDb, async (req, res) => {

  const rows = prepare(
    'SELECT id, name, qq, high_math, theory, practical, english, total_score, created_at FROM scores WHERE batch_type = ? ORDER BY total_score DESC, id ASC'
  ).all('normal');

  const ranked = rows.map((row, i) => ({
    rank: i + 1,
    ...row,
    name: maskName(row.name),
    qq: maskQQ(row.qq),
  }));

  res.json(ranked);
});

// ====== 管理员 API ======

// 管理员查看所有批次数据（不匿名）
app.get('/api/admin/scores', adminAuth, ensureDb, async (req, res) => {
  const { batch_type } = req.query;

  let rows;
  if (batch_type && batch_type !== 'all') {
    rows = prepare(
      'SELECT * FROM scores WHERE batch_type = ? ORDER BY total_score DESC, id ASC'
    ).all(batch_type);
  } else {
    rows = prepare(
      'SELECT * FROM scores ORDER BY batch_type, total_score DESC, id ASC'
    ).all();
  }

  const result = {};
  for (const row of rows) {
    const bt = row.batch_type;
    if (!result[bt]) result[bt] = [];
    result[bt].push(row);
  }

  res.json(batch_type && batch_type !== 'all' ? result[batch_type] || [] : result);
});

// 管理员修改成绩
app.put('/api/admin/scores/:id', adminAuth, ensureDb, async (req, res) => {
  const { id } = req.params;
  const { name, qq, high_math, theory, practical, english } = req.body;

  const existing = prepare('SELECT * FROM scores WHERE id = ?').all(parseInt(id));
  if (existing.length === 0) {
    return res.status(404).json({ error: '记录不存在' });
  }

  const record = existing[0];
  const updates = {
    name: name !== undefined ? String(name).trim() : record.name,
    qq: qq !== undefined ? String(qq).replace(/\D/g, '') : record.qq,
    high_math: high_math !== undefined ? parseFloat(high_math) : record.high_math,
    theory: theory !== undefined ? parseFloat(theory) : record.theory,
    practical: practical !== undefined ? parseFloat(practical) : record.practical,
    english: english !== undefined ? parseFloat(english) : record.english,
  };

  prepare(
    'UPDATE scores SET name = ?, qq = ?, high_math = ?, theory = ?, practical = ?, english = ? WHERE id = ?'
  ).run(updates.name, updates.qq, updates.high_math, updates.theory, updates.practical, updates.english, parseInt(id));

  res.json({ success: true });
});

// 管理员删除成绩
app.delete('/api/admin/scores/:id', adminAuth, ensureDb, async (req, res) => {
  const { id } = req.params;

  const existing = prepare('SELECT * FROM scores WHERE id = ?').all(parseInt(id));
  if (existing.length === 0) {
    return res.status(404).json({ error: '记录不存在' });
  }

  prepare('DELETE FROM scores WHERE id = ?').run(parseInt(id));
  res.json({ success: true });
});

// ====== 生产模式：serve 前端静态文件 ======
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ====== 启动 ======
const PORT = process.env.PORT || 3001;

// 先监听端口（确保健康检查立即可用）
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // 后台初始化数据库
  getDb().then(() => console.log('Database ready')).catch(err => console.error('DB init error:', err));
});
