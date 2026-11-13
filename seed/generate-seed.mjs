#!/usr/bin/env node
/**
 * 由 seed/products.json 生成 seed/seed.sql
 * 用法: node seed/generate-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const products = JSON.parse(readFileSync(join(__dirname, 'products.json'), 'utf8'));

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const rows = products.map((p) => {
  const status = p.name.includes('已下架') || (p.details || '').startsWith('【已下架】') ? '已下架' : '在售';
  return `('${esc(p.code)}', '${esc(p.name)}', '${esc(p.category)}', '${esc(p.type)}',
    '${esc(JSON.stringify(p.tags))}',
    ${p.min_age}, ${p.max_age},
    '${esc(p.period || '')}', '${esc(p.payment || '')}',
    ${p.min_premium ?? 'NULL'},
    '${esc(JSON.stringify(p.features || []))}',
    '${esc(p.details || '')}',
    '${status}')`;
});

const sql = `-- 由 seed/products.json 自动生成, 请勿手改
DELETE FROM products;
INSERT INTO products (code, name, category, type, tags, min_age, max_age, period, payment, min_premium, features, details, status) VALUES
${rows.join(',\n')};
`;

writeFileSync(join(__dirname, 'seed.sql'), sql);
console.log(`已生成 seed/seed.sql, 共 ${products.length} 款产品`);
