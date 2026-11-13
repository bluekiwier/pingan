# 平安寿险产品智能匹配

基于《平安保险产品简汇 2026》整理的寿险产品查询网站：输入被保人年龄、性别、保障需求和预算，按匹配度返回适配产品，并展示每款产品的完整保障责任。

## 技术方案

| 需求 | 选型 | 说明 |
| --- | --- | --- |
| Node.js | Cloudflare Workers + Hono | TypeScript 编写，Workers 运行时，本地用 `wrangler dev` 跑在 Node 上 |
| 本地数据库 SQLite | Cloudflare D1 | **D1 底层就是 SQLite**，同一套 SQL；本地开发时 D1 模拟器会在 `.wrangler/` 下生成真实 SQLite 文件 |
| 部署到 Cloudflare | `wrangler deploy` | 一条命令发布，免费额度足够个人/小团队使用；数据库、静态页面、API 同域，无需额外服务器 |

相比自建 Node + better-sqlite3 + Nginx，这套方案不需要买服务器、不需要操心 SQLite 文件持久化（Workers 无状态），部署成本最低。

## 本地运行

```bash
npm install
npm run dev      # 自动建表 + 导入种子数据 + 启动 http://localhost:8787
```

`npm run dev` 实际执行：

1. `node seed/generate-seed.mjs` —— 由 `seed/products.json` 生成 `seed/seed.sql`
2. `wrangler d1 migrations apply DB --local` —— 建表
3. `wrangler d1 execute DB --local --file=seed/seed.sql` —— 导入产品数据
4. `wrangler dev` —— 启动本地服务（本地 SQLite，数据在 `.wrangler/state`）

## 部署到 Cloudflare

```bash
# 1. 登录（浏览器授权）
npx wrangler login

# 2. 创建 D1 数据库，记下输出的 database_id
npx wrangler d1 create pingan-products

# 3. 把 database_id 填入 wrangler.jsonc 的 d1_databases[0].database_id

# 4. 建表并导入数据到线上库
npm run seed:remote

# 5. 发布
npm run deploy
```

发布后得到 `https://pingan-product-matcher.<你的子域>.workers.dev`，可直接分享。

> 提示：`npm run seed:remote` 会 `DELETE` 后重新插入，属于全量覆盖，重复执行安全。
> 若只想更新产品数据，改完 `seed/products.json` 后重新执行该命令并 `npm run deploy` 即可。

## 目录结构

```
pingan-product-matcher/
├── src/index.ts              # Hono 后端：匹配算法 + 3 个 API
├── public/index.html         # 单页前端（原生 JS，无构建步骤）
├── migrations/0001_schema.sql# 表结构
├── seed/products.json        # 产品数据源（53 款，人工校对自 PDF）
├── seed/generate-seed.mjs    # 生成 seed.sql
├── wrangler.jsonc            # Workers / D1 / 静态资源配置
└── package.json
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/meta` | 需求标签、产品分类字典 |
| GET | `/api/products?q=&category=` | 产品列表 / 搜索 |
| GET | `/api/products/:code` | 单品详情 |
| POST | `/api/match` | 智能匹配 |

`POST /api/match` 请求体：

```json
{
  "age": 30,
  "gender": "m",
  "needs": ["重疾", "医疗"],
  "budget": 6000,
  "mainOnly": false,
  "includeOffShelf": false
}
```

匹配规则：

1. **硬性过滤**：年龄不在产品投保年龄区间 → 排除；选填预算时，起保点高于预算 → 排除；默认排除已下架产品。
2. **打分排序**：命中的需求标签每个 +10；预算内 +4；在售 +3；主险 +2；无独立起保门槛 +2；分红/税优 +1。
3. **返回理由**：每款产品附带「为什么匹配」的可读说明。

## 数据说明

- 数据来自《平安保险产品简汇 2026》（45 页整理稿），共 **53 条产品/账户**，覆盖 6 个章节：一年期附加险、可附加长险、保障险种、一年期 O2O、财富险及万能险、税延（优）产品。
- 字段包括：险种代码、名称、分类、产品类型、需求标签、投保年龄、保险期间、交费期间、起保点、保障亮点、保障责任详情、在售状态。
- 文档只提供投保规则与保障责任，**不含费率表**，因此本工具做的是"资格 + 需求"匹配，不测算保费；`min_premium` 为文档中明示的起保点，`null` 表示随主险或未明确。

> 免责声明：本项目为产品知识学习与初步筛选工具，保险责任、费率及投保规则以平安人寿官方条款和投保提示为准，不构成投保建议。
