# NoCodeBackend 移行完了レポート

## 概要

KakeiboVibe のバックエンドを PostgreSQL + Hasura から NoCodeBackend に移行完了。

| 項目         | 旧環境                   | 新環境                        |
| ------------ | ------------------------ | ----------------------------- |
| DB           | PostgreSQL (self-hosted) | NoCodeBackend (MySQL)         |
| API          | Hasura GraphQL           | REST API                      |
| 認証         | Hasura Admin Secret      | Bearer Token                  |
| バックアップ | 手動                     | 自動（1 日 1 回、7 日間保持） |

---

## 接続情報

```
Base URL: https://ncb.fukushi.ma
Instance: 52811_kakeibo
API Docs: https://ncb.fukushi.ma/docs
```

### 認証

```
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

---

## API エンドポイント

| 操作        | メソッド | エンドポイント                                |
| ----------- | -------- | --------------------------------------------- |
| 全件取得    | GET      | `/read/{table}?Instance=52811_kakeibo`        |
| ID 指定取得 | GET      | `/read/{table}/{id}?Instance=52811_kakeibo`   |
| 作成        | POST     | `/create/{table}?Instance=52811_kakeibo`      |
| 更新        | PATCH    | `/update/{table}/{id}?Instance=52811_kakeibo` |
| 削除        | DELETE   | `/delete/{table}/{id}?Instance=52811_kakeibo` |

### クエリパラメータ

| パラメータ     | 説明       | 例                            |
| -------------- | ---------- | ----------------------------- |
| `limit`        | 取得件数   | `?limit=100`                  |
| `page`         | ページ番号 | `?page=2`                     |
| `sort`         | ソート     | `?sort=created_at&order=desc` |
| `where`        | フィルタ   | `?where=(amount,gt,1000)`     |
| `includeTotal` | 総件数取得 | `?includeTotal=true`          |

### フィルタ演算子

| 演算子       | 説明              | 例                       |
| ------------ | ----------------- | ------------------------ |
| `eq`         | 等しい            | `?category_id[eq]=5`     |
| `neq`        | 等しくない        | `?status[neq]=deleted`   |
| `gt` / `gte` | より大きい / 以上 | `?amount[gt]=1000`       |
| `lt` / `lte` | より小さい / 以下 | `?amount[lte]=500`       |
| `like`       | 部分一致          | `?content[like]=Amazon`  |
| `in`         | いずれかに一致    | `?category_id[in]=1,2,3` |

---

## スキーマ

### テーブル一覧

| テーブル                    | 件数  | 説明           |
| --------------------------- | ----- | -------------- |
| households                  | 1     | 世帯           |
| users                       | 2     | ユーザー       |
| user_aliases                | 2     | ユーザー別名   |
| categories                  | 84    | カテゴリ       |
| tags                        | 4     | タグ           |
| burden_ratios               | 22    | 負担割合       |
| burden_ratio_details        | 44    | 負担割合詳細   |
| exclusion_rules             | 32    | 除外ルール     |
| monthly_memos               | 16    | 月次メモ       |
| transactions                | 9,930 | 取引           |
| transaction_shares          | 2,504 | 取引分担       |
| transaction_share_overrides | 186   | 取引分担上書き |
| transaction_tags            | 128   | 取引タグ       |

### ER 図（依存関係）

```
households
├── users
│   ├── user_aliases
│   ├── burden_ratio_details
│   ├── transaction_shares
│   └── transaction_share_overrides
├── categories
│   └── exclusion_rules
├── tags
│   └── transaction_tags
├── burden_ratios
│   └── burden_ratio_details
├── monthly_memos
└── transactions
      ├── transaction_shares (via moneyforward_id)
      ├── transaction_share_overrides (via moneyforward_id)
      └── transaction_tags (via moneyforward_id)
```

### 主要テーブル詳細

#### transactions

| カラム                    | 型           | 説明                 |
| ------------------------- | ------------ | -------------------- |
| id                        | int          | PK                   |
| household_id              | int          | FK → households      |
| moneyforward_id           | varchar(255) | MoneyForward ID      |
| transaction_date          | date         | 取引日               |
| content                   | text         | 内容                 |
| amount                    | int          | 金額                 |
| category_id               | int          | FK → categories      |
| memo                      | text         | メモ                 |
| processing_status         | varchar(255) | 処理ステータス       |
| applied_burden_ratio_id   | int          | FK → burden_ratios   |
| applied_exclusion_rule_id | int          | FK → exclusion_rules |
| financial_institution     | varchar(255) | 金融機関             |
| is_calculation_target     | boolean      | 計算対象フラグ       |
| is_transfer               | boolean      | 振替フラグ           |

#### categories

| カラム       | 型           | 説明                               |
| ------------ | ------------ | ---------------------------------- |
| id           | int          | PK                                 |
| household_id | int          | FK → households                    |
| major_name   | varchar(255) | 大カテゴリ                         |
| minor_name   | varchar(255) | 小カテゴリ                         |
| cost_type    | enum         | '固定','変動','特別','立替','振替' |

---

## アプリ側の変更点

### 1. 環境変数

```diff
- HASURA_ENDPOINT=http://localhost:8080/v1/graphql
- HASURA_ADMIN_SECRET=xxxxx
+ NCB_BASE_URL=https://ncb.fukushi.ma
+ NCB_API_KEY=<your_api_key>
+ NCB_INSTANCE=52811_kakeibo
```

### 2. API 呼び出し

**Before (Hasura GraphQL):**

```graphql
query GetTransactions($limit: Int!) {
  transactions(limit: $limit, order_by: { transaction_date: desc }) {
    id
    content
    amount
    transaction_date
    category {
      major_name
      minor_name
    }
  }
}
```

**After (NoCodeBackend REST):**

```javascript
const response = await fetch(
  `${NCB_BASE_URL}/read/transactions?Instance=${NCB_INSTANCE}&limit=${limit}&sort=transaction_date&order=desc`,
  {
    headers: {
      Authorization: `Bearer ${NCB_API_KEY}`,
      "Content-Type": "application/json",
    },
  }
);
const { data } = await response.json();
```

### 3. JOIN → 個別取得

NoCodeBackend では基本的に JOIN がないため、関連データは個別に取得するか、NCB の Join 機能でカスタムエンドポイントを作成。

```javascript
// categoriesを事前に取得してマップ化
const categories = await fetchCategories();
const categoryMap = new Map(categories.map((c) => [c.id, c]));

// transactionsにcategory情報を付与
const enrichedTransactions = transactions.map((t) => ({
  ...t,
  category: categoryMap.get(t.category_id),
}));
```

### 4. レスポンス形式

```json
{
  "status": "success",
  "data": [...],
  "metadata": {
    "page": 1,
    "limit": 10,
    "hasMore": true,
    "hasPrev": false
  }
}
```

---

## 制約事項

| 項目           | 制約                                |
| -------------- | ----------------------------------- |
| バルク操作     | 非対応（1 件ずつ処理）              |
| GraphQL        | 非対応（REST API のみ）             |
| 直接 SQL       | 非対応（UI の SQL Playground のみ） |
| レートリミット | Tier 1: 20 リクエスト/10 秒         |

---

## 移行検証結果

```
全テーブル: 13/13 ✅
全レコード: 12,955件 ✅
全カラム値: 完全一致 ✅
```

| テーブル                    | 件数  | カラム数 | 結果 |
| --------------------------- | ----- | -------- | ---- |
| households                  | 1     | 2        | ✅   |
| users                       | 2     | 4        | ✅   |
| user_aliases                | 2     | 3        | ✅   |
| categories                  | 84    | 5        | ✅   |
| tags                        | 4     | 3        | ✅   |
| burden_ratios               | 22    | 4        | ✅   |
| burden_ratio_details        | 44    | 4        | ✅   |
| exclusion_rules             | 32    | 4        | ✅   |
| monthly_memos               | 16    | 6        | ✅   |
| transactions                | 9,930 | 14       | ✅   |
| transaction_shares          | 2,504 | 4        | ✅   |
| transaction_share_overrides | 186   | 5        | ✅   |
| transaction_tags            | 128   | 3        | ✅   |

---

## 参考リンク

- NoCodeBackend API 仕様: `.docs/ai/specs/NocodeBackend/NoCodeBackend_SpecSheet_for_LLM.md`
- Swagger JSON: `https://ncb.fukushi.ma/docs` からエクスポート可能
