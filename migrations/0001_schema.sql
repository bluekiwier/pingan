-- 平安寿险产品库
CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,       -- 险种代码
  name         TEXT NOT NULL,              -- 产品名称
  category     TEXT NOT NULL,              -- 所属章节
  type         TEXT NOT NULL,              -- 主险/附加险/万能账户/O2O 产品
  tags         TEXT NOT NULL,              -- 需求标签(JSON数组): 重疾/医疗/门诊/意外/寿险/养老/教育/财富/护理/税优/万能/豁免/分红/少儿/储蓄
  min_age      INTEGER NOT NULL,           -- 投保最小年龄
  max_age      INTEGER NOT NULL,           -- 投保最大年龄
  period       TEXT,                       -- 保险期间
  payment      TEXT,                       -- 交费期间
  min_premium  INTEGER,                    -- 起保点保费(元/年, 估算), NULL 表示随主险或未明确
  features     TEXT NOT NULL,              -- 保障亮点(JSON数组)
  details      TEXT NOT NULL,              -- 保障责任详情
  status       TEXT NOT NULL DEFAULT '在售' -- 在售/已下架
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_age ON products(min_age, max_age);
