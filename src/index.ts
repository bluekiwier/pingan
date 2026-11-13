import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('/api/*', cors());

/** 全部需求标签及中文名 */
const TAG_LABELS = {
  重疾: '重疾保障',
  医疗: '医疗报销',
  门诊: '门急诊',
  意外: '意外保障',
  寿险: '身故/寿险',
  养老: '养老金规划',
  教育: '子女教育金',
  财富: '财富增值',
  护理: '护理/失能',
  税优: '个税抵扣',
  万能: '万能账户',
  豁免: '保费豁免',
  分红: '保单分红',
  少儿: '少儿专属',
  储蓄: '满期返还',
};

function parseJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

async function loadAllProducts(db) {
  const { results } = await db
    .prepare(
      `SELECT * FROM products ORDER BY
        CASE category
          WHEN '一年期附加险' THEN 1
          WHEN '可附加长险' THEN 2
          WHEN '保障险种' THEN 3
          WHEN '一年期 O2O' THEN 4
          WHEN '财富险及万能险' THEN 5
          WHEN '税延（优）产品' THEN 6
          ELSE 9
        END, id`
    )
    .all();
  return results.map((r) => ({
    ...r,
    tags: parseJson(r.tags, []),
    features: parseJson(r.features, []),
  }));
}

/** 匹配打分 */
function matchProducts(products, opts) {
  const { age, gender, needs = [], budget, mainOnly = false, includeOffShelf = false } = opts;
  const reasonsOf = (p) => [];
  const results = [];

  for (const p of products) {
    if (!includeOffShelf && p.status !== '在售') continue;
    if (mainOnly && p.type !== '主险') continue;

    // 年龄资格：核心硬条件
    if (Number.isFinite(age) && (age < p.min_age || age > p.max_age)) continue;

    const reasons = reasonsOf();

    // 年龄资格
    reasons.push(`投保年龄 ${p.min_age}-${p.max_age} 岁符合`);

    // 需求标签匹配
    const matchedNeeds = needs.filter((n) => p.tags.includes(n));
    // 选择了需求时，过滤掉完全不相关的产品
    if (needs.length > 0 && matchedNeeds.length === 0) continue;
    let score = matchedNeeds.length * 10;
    for (const n of matchedNeeds) reasons.push(`满足需求「${TAG_LABELS[n] || n}」`);

    // 预算（起保点）
    if (Number.isFinite(budget) && budget > 0) {
      if (p.min_premium == null) {
        score += 2;
        reasons.push('保费随主险，无独立起保门槛');
      } else if (p.min_premium <= budget) {
        score += 4;
        reasons.push(`起保点 ${p.min_premium.toLocaleString()} 元/年 ≤ 你的预算`);
      } else {
        continue; // 起保点超出预算，过滤
      }
    }

    // 在售优先
    if (p.status === '在售') score += 3;
    // 主险优先
    if (p.type === '主险') score += 2;
    // 分红/税优等加分
    if (p.tags.includes('税优')) score += 1;
    if (p.tags.includes('分红')) score += 1;

    results.push({ product: p, score, reasons });
  }

  results.sort((a, b) => b.score - a.score || a.product.id - b.product.id);
  return results;
}

// ---------- API ----------

app.get('/api/meta', (c) => {
  return c.json({
    tags: Object.entries(TAG_LABELS).map(([key, label]) => ({ key, label })),
    categories: ['一年期附加险', '可附加长险', '保障险种', '一年期 O2O', '财富险及万能险', '税延（优）产品'],
  });
});

app.get('/api/products', async (c) => {
  const products = await loadAllProducts(c.env.DB);
  const q = (c.req.query('q') || '').trim().toLowerCase();
  const category = c.req.query('category');
  let list = products;
  if (category) list = list.filter((p) => p.category === category);
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q))
    );
  }
  return c.json({ total: list.length, products: list });
});

app.get('/api/products/:code', async (c) => {
  const code = c.req.param('code');
  const row = await c.env.DB.prepare('SELECT * FROM products WHERE code = ?').bind(code).first();
  if (!row) return c.json({ error: '未找到该产品' }, 404);
  return c.json({ ...row, tags: parseJson(row.tags, []), features: parseJson(row.features, []) });
});

app.post('/api/match', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const age = Number(body.age);
  const gender = body.gender || '';
  const needs = Array.isArray(body.needs) ? body.needs : [];
  const budget = body.budget != null && body.budget !== '' ? Number(body.budget) : null;
  const mainOnly = !!body.mainOnly;
  const includeOffShelf = !!body.includeOffShelf;

  if (!Number.isFinite(age) || age < 0 || age > 100) {
    return c.json({ error: '请输入 0-100 之间的年龄' }, 400);
  }

  const products = await loadAllProducts(c.env.DB);
  const results = matchProducts(products, { age, gender, needs, budget, mainOnly, includeOffShelf });

  return c.json({
    query: { age, gender, needs, budget, mainOnly },
    total: results.length,
    results: results.map((r) => ({
      score: r.score,
      reasons: r.reasons,
      product: r.product,
    })),
  });
});

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;
