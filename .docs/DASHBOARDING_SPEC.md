# Kakeibo-Dashboarding 機能仕様書

> このドキュメントは、Dashboarding アプリケーションの全機能を網羅的に記載しています。
> Kakeibo-App 統合時の参照用。

---

## 概要

**Kakeibo-Dashboarding** は、家計簿データの可視化・分析を行うダッシュボードアプリケーションです。
Batch-Processor で取り込んだデータを閲覧・分析するためのビューアーとして機能します。

### 主要ユースケース

1. 月次支出サマリーの確認
2. ユーザー別負担額の確認
3. カテゴリ別・コストタイプ別の支出分析
4. 月次比較（トレンド分析）
5. タグ別支出集計
6. AI による家計分析・アドバイス

---

## 画面構成

### メインタブ（4つのビュー）

```
┌─────────────────────────────────────────────────────┐
│  Kakeibo Dashboard                                   │
├─────────────────────────────────────────────────────┤
│  [ダッシュボード] [詳細] [月次比較] [タグ別集計]        │
└─────────────────────────────────────────────────────┘
```

---

## 機能詳細

### 1. ダッシュボード（Dashboard）

#### 1.1 サマリーカード

**総支出表示:**
- 選択月の総支出金額
- クリックで取引詳細モーダルを開く

**ユーザー別負担額:**
- 各ユーザーの負担金額を表示
- 按分計算済みの金額
- クリックでそのユーザーの取引詳細モーダルを開く

#### 1.2 カテゴリ別円グラフ

**表示内容:**
- 大項目（major_name）別の支出割合
- 円グラフで可視化
- 各セグメントの金額と割合を表示

#### 1.3 コストタイプ別内訳（CostTypeTable）

**3階層の展開表示:**
```
固定費: ¥XX,XXX
├── 住居: ¥XX,XXX
│   ├── 家賃: ¥XX,XXX
│   └── 光熱費: ¥XX,XXX
└── 通信: ¥XX,XXX

変動費: ¥XX,XXX
├── 食費: ¥XX,XXX
│   ├── 食料品: ¥XX,XXX
│   └── 外食: ¥XX,XXX
└── ...
```

**インタラクション:**
- 各行をクリックで展開/折りたたみ
- 金額クリックで取引詳細モーダル

#### 1.4 月次メモ（MonthlyMemoCard）

**機能:**
- 選択月に対するメモを保存
- テキストエリアで編集
- 自動保存 or 保存ボタン
- 保存ステータス表示（保存中/保存完了/エラー）

---

### 2. 詳細（Transaction Details）

#### 2.1 ピボットテーブル表示

**3つのグループ化オプション:**

| タブ名 | グループ化 |
|--------|-----------|
| 日付・ステータス順 | 日付 > 処理ステータス |
| ステータス・日付順 | 処理ステータス > 日付 |
| カテゴリ順 | 大項目 > 中項目 |

#### 2.2 按分スライダー

**機能（Batch-Processor と同等）:**
- ドラッグで按分比率を0-100%で調整
- ユーザー1の比率を設定 → ユーザー2は自動計算
- リアルタイムで金額計算を表示

**色分け:**
| 色 | 状態 |
|----|------|
| 緑 | デフォルト按分使用中 |
| 赤 | 手動オーバーライドあり |
| グレー | 計算済み按分あり |

#### 2.3 一括操作

**デフォルト按分を適用:**
- 全取引に当月のデフォルト按分を一括適用

**変更を保存:**
- 未保存の変更件数を表示
- クリックでDBに永続化

---

### 3. 月次比較（Monthly Comparison）

#### 3.1 比較テーブル

**表示内容:**
- 直近4ヶ月のデータを並列表示
- カテゴリ別の月次推移
- 月間変動（前月比）の表示

**テーブル構造:**
```
| カテゴリ | 2025/09 | 2025/10 | 2025/11 | 2025/12 |
|---------|---------|---------|---------|---------|
| 食費    | ¥30,000 | ¥32,000 | ¥28,000 | ¥35,000 |
| 住居    | ¥80,000 | ¥80,000 | ¥80,000 | ¥80,000 |
| ...     | ...     | ...     | ...     | ...     |
```

**インタラクション:**
- セルクリックで該当月・カテゴリの取引詳細モーダル

#### 3.2 固定費 vs 変動費チャート（棒グラフ）

**表示内容:**
- X軸: 月
- Y軸: 金額
- 積み上げ棒グラフ（固定費/変動費）

#### 3.3 ユーザー別負担推移チャート（折れ線グラフ）

**表示内容:**
- X軸: 月
- Y軸: 金額
- 各ユーザーの負担額を線で表示

---

### 4. タグ別集計（Tag Summary）

#### 4.1 タグ一覧テーブル

**表示内容:**
- タグ名
- 総金額
- 取引件数

**ソート:**
- 金額降順

#### 4.2 展開表示

**機能:**
- タグ行をクリックで展開
- そのタグが付いた取引一覧を表示
- 各取引の日付、内容、金額を表示

---

### 5. AI分析（AIAnalysisModal）

#### 5.1 分析開始

**トリガー:**
- 「🔮 AIで分析＆チャット」ボタンクリック

**初期分析:**
- 選択月のデータサマリーを自動送信
- AI が家計状況を分析してコメント

#### 5.2 チャットインターフェース

**機能:**
- マルチターン会話
- ユーザーからの質問入力
- Markdown 形式のレスポンス表示

**AIペルソナ:**
- 家計アドバイザー
- 世帯情報を考慮したアドバイス

#### 5.3 AI設定

**モデル:** Gemini 2.5 Flash
**システムプロンプト:**
- 家計アドバイザーとしての振る舞い
- 世帯構成（2人世帯）の情報
- 按分の概念理解

---

### 6. 取引詳細モーダル（TransactionDetailModal）

#### 6.1 トリガー

**開くタイミング:**
- ダッシュボードの金額クリック
- 月次比較のセルクリック
- コストタイプテーブルの金額クリック

#### 6.2 表示内容

**取引一覧:**
- 日付
- 内容
- カテゴリ
- 金額
- 各ユーザーの按分金額
- メモ（あれば）

**フィルタ状態:**
- モーダルタイトルにコンテキスト表示
  - 例: 「2025年12月 食費の取引」

---

## コントロールパネル

### 共通コントロール

**年月選択:**
- 年: 2024年〜現在年
- 月: 01〜12（動的制限あり）

**表示ボタン:**
- クリックでデータ再取得

**タグ付き取引を含める:**
- チェックボックス
- ON: タグ付き取引も集計に含める
- OFF: タグ付き取引を除外

**今月のデフォルト按分:**
- 選択月の按分比率を表示
- 例: `福島 啓斗: 65% / 福島 和香: 35%`

---

## データモデル

### 使用テーブル（Batch-Processor と共通）

| テーブル | 用途 |
|---------|------|
| transactions | 取引データ |
| transaction_shares | 按分結果 |
| transaction_share_overrides | 按分オーバーライド |
| categories | カテゴリマスタ |
| users | ユーザーマスタ |
| user_aliases | ユーザー別名 |
| burden_ratios | 月別按分比率 |
| burden_ratio_details | 按分比率詳細 |
| tags | タグマスタ |
| transaction_tags | 取引タグ紐付け |
| monthly_memos | 月次メモ |

### Dashboarding 固有のデータ

**monthly_memos テーブル:**
| カラム | 型 | 説明 |
|--------|-----|------|
| id | integer | 主キー |
| household_id | integer | 世帯ID |
| target_month | string | 対象月（YYYY-MM） |
| memo_content | text | メモ内容 |

---

## API仕様

### 現在の実装

**バックエンド:** Hasura GraphQL
**エンドポイント:** `https://hasura.fukushi.ma/v1/graphql`

### 主要クエリ

**取引取得:**
```graphql
query GetTransactions($where: transactions_bool_exp) {
  transactions(where: $where, order_by: {transaction_date: desc}) {
    id
    transaction_date
    content
    amount
    category_id
    moneyforward_id
    processing_status
    memo
  }
}
```

**月次メモ取得/更新:**
```graphql
mutation UpsertMonthlyMemo($object: monthly_memos_insert_input!) {
  insert_monthly_memos_one(
    object: $object
    on_conflict: {
      constraint: monthly_memos_household_id_target_month_key
      update_columns: [memo_content]
    }
  ) {
    id
    memo_content
  }
}
```

---

## AI 統合

### Gemini API

**モデル:** `gemini-2.5-flash`
**認証:** 環境変数 `API_KEY`

### データ送信フォーマット

```json
{
  "summary": {
    "totalSpending": 150000,
    "byCategory": {
      "食費": 30000,
      "住居": 80000,
      "...": "..."
    },
    "userShares": {
      "啓斗": 97500,
      "和香": 52500
    }
  },
  "month": "2025-12"
}
```

### システムプロンプト

```
あなたは家計アドバイザーです。
2人世帯（夫婦）の家計を分析し、アドバイスを提供してください。
按分とは、共通費用を世帯メンバーで分担する仕組みです。
```

---

## UI/UXパターン

### カラーパレット

```css
/* ダッシュボードテーマ（青系） */
--primary: #2b6cb0;
--primary-light: #4299e1;

/* ステータス */
--success: #2f855a;
--error: #c53030;

/* 背景 */
--bg-dashboard: #f4f7f9;
--bg-details: #f8f6f2;
--bg-comparison: #f2f8f5;
--bg-tags: #f6f4f9;
```

### ビュー別背景色

| ビュー | 背景色 |
|--------|--------|
| ダッシュボード | #f4f7f9（薄い青グレー） |
| 詳細 | #f8f6f2（薄いベージュ） |
| 月次比較 | #f2f8f5（薄い緑） |
| タグ別 | #f6f4f9（薄い紫） |

---

## 状態管理

### カスタムフック

| フック | 責務 |
|--------|------|
| useMasterData | マスターデータの取得・キャッシュ |
| useTransactions | 取引データの取得・enrichment |
| useAIChat | AI会話の管理 |
| useDetailModal | モーダル状態管理 |
| useMonthlyMemo | 月次メモのCRUD |
| useComparisonData | 月次比較データの取得 |
| useTagSummaryData | タグ集計データの取得 |

### グローバル状態

```typescript
// App レベル
selectedYear: string
selectedMonth: string
viewMode: 'dashboard' | 'details' | 'comparison' | 'tags'
includeTagged: boolean  // タグ付き取引を含めるか
```

---

## Enrichment パターン

### EnrichedTransaction

```typescript
interface EnrichedTransaction extends Transaction {
  // カテゴリ情報
  categoryMajorName: string;
  categoryMinorName: string;
  costType: '固定' | '変動' | '立替' | '精算';

  // 按分情報
  hasOverrides: boolean;
  sharesToDisplay: { alias: string; text: string }[];
  sharesColor: string;
  initialShares: { userId: number; amount: number; percent: number }[];
  defaultPercent: number | null;

  // タグ情報
  tags: Tag[];
}
```

---

## 統合時の注意点

### Batch-Processor との重複機能

| 機能 | Batch-Processor | Dashboarding | 統合後 |
|------|-----------------|--------------|--------|
| 取引詳細表示 | ✅ | ✅ | 統一 |
| 按分スライダー | ✅ | ✅ | 統一 |
| ピボットテーブル | ✅ | ✅ | 統一 |

### Dashboarding 固有機能

- ダッシュボード（サマリーカード、円グラフ）
- 月次比較（4ヶ月比較、チャート）
- タグ別集計
- AI分析
- 月次メモ

### 統合時に必要な作業

1. 共通コンポーネントの抽出
2. ルーティングの統合
3. 状態管理の統一
4. API レイヤーの統一（Hono 経由）
