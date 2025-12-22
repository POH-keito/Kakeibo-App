# バックエンドビジネスロジック移行仕様書

> このドキュメントは、フロントエンドに存在するビジネスロジックをバックエンドに移行するための仕様書です。
> 旧バージョン (Kakeibo-Batch-Processor) の実装を正として記載しています。

---

## 概要

### 移行の目的

1. **型安全性の向上**: ビジネスロジックをバックエンドに集約し、Hono RPC で型安全な通信を実現
2. **コードの重複排除**: フロントエンド各所に散在するロジックを統一
3. **テスト容易性**: バックエンドでユニットテスト可能に
4. **セキュリティ**: クライアント側でのデータ操作を最小化

### 対象ロジック

| ロジック | 現在の場所 | 移行先 |
|----------|-----------|--------|
| processing_status 判定 | フロントエンド (CSV import時) | `POST /api/import/parse` |
| 按分計算 (burden ratio) | フロントエンド | `GET /api/transactions/summary` |
| オーバーライド適用 | フロントエンド | `GET /api/transactions` (enriched) |
| カテゴリ集計 | フロントエンド | `GET /api/transactions/summary` |

---

## 1. Processing Status 判定ロジック

### 判定フロー（優先順位順）

```
1. 振替チェック
   row['振替'] === true → '集計除外_振替'
   ↓
2. 計算対象チェック
   row['計算対象'] === false → '集計除外_計算対象外'
   ↓
3. ユーザー別名チェック
   memo が userAlias で始まる → '按分_{userAlias}'
   ↓
4. 除外ルールチェック
   category が exclusionRule にマッチ → '集計除外_項目'
   ↓
5. デフォルト
   上記いずれにも該当しない → '按分_家計'
```

### 旧実装コード（transactionProcessor.ts:9-27）

```typescript
function determineProcessingStatus(
  row: MoneyForwardCsvRow,
  rules: KakeiboRules
): { status: string; targetUserAlias?: string } {
  // 1. 振替は除外
  if (row['振替'] === true) return { status: '集計除外_振替' };

  // 2. 計算対象外は除外
  if (row['計算対象'] === false) return { status: '集計除外_計算対象外' };

  // 3. メモがユーザー別名で始まる場合、その人の個人負担
  for (const alias of rules.userAliases) {
    if (row['メモ'] && row['メモ'].startsWith(alias)) {
      return { status: `按分_${alias}`, targetUserAlias: alias };
    }
  }

  // 4. メモが '家計' で始まる場合、家計共通
  if (row['メモ'] && row['メモ'].startsWith('家計')) {
    return { status: '按分_家計' };
  }

  // 5. 除外ルールにマッチする場合
  const exclusionRule = findAppliedExclusionRule(row, rules);
  if (exclusionRule) {
    return { status: '集計除外_項目' };
  }

  // 6. デフォルトは家計共通
  return { status: '按分_家計' };
}
```

### 新バックエンド実装（推奨）

**ファイル:** `backend/src/lib/business-logic.ts`

```typescript
import { z } from 'zod';

export const ProcessingStatusSchema = z.enum([
  '按分_家計',
  '集計除外_振替',
  '集計除外_計算対象外',
  '集計除外_項目',
]).or(z.string().regex(/^按分_.+$/));

export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

interface DetermineStatusParams {
  isTransfer: boolean;
  isCalculationTarget: boolean;
  memo: string | null;
  majorName: string;
  minorName: string;
  userAliases: string[];
  exclusionRules: { majorName: string; minorName: string; id: number }[];
}

interface StatusResult {
  status: ProcessingStatus;
  targetUserAlias?: string;
  appliedExclusionRuleId?: number;
}

export function determineProcessingStatus(params: DetermineStatusParams): StatusResult {
  const { isTransfer, isCalculationTarget, memo, majorName, minorName, userAliases, exclusionRules } = params;

  // 1. 振替は除外
  if (isTransfer) {
    return { status: '集計除外_振替' };
  }

  // 2. 計算対象外は除外
  if (!isCalculationTarget) {
    return { status: '集計除外_計算対象外' };
  }

  // 3. メモがユーザー別名で始まる場合
  if (memo) {
    for (const alias of userAliases) {
      if (memo.startsWith(alias)) {
        return { status: `按分_${alias}`, targetUserAlias: alias };
      }
    }

    // メモが '家計' で始まる場合
    if (memo.startsWith('家計')) {
      return { status: '按分_家計' };
    }
  }

  // 4. 除外ルールにマッチする場合
  const matchedRule = exclusionRules.find(
    rule => rule.majorName === majorName && rule.minorName === minorName
  );
  if (matchedRule) {
    return { status: '集計除外_項目', appliedExclusionRuleId: matchedRule.id };
  }

  // 5. デフォルトは家計共通
  return { status: '按分_家計' };
}
```

---

## 2. 按分計算ロジック（Burden Ratio Calculation）

### 計算フロー

```
1. オーバーライドチェック
   transaction_share_overrides あり → オーバーライド適用
   ↓
2. 既存 shares チェック
   transaction_shares あり → 既存値使用
   ↓
3. デフォルト按分計算
   processing_status による分岐:
   - '按分_家計' → 月別 burden_ratio 適用
   - '按分_{alias}' → 対象ユーザー 100%, 他 0%
   - '集計除外_*' → shares なし
```

### 月別按分比率の取得

**旧実装（transactionProcessor.ts:54-59）:**

```typescript
// トランザクション日付から年月を抽出
const transactionDate = new Date(row['日付']);
const yearMonth = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;

// effective_month でマッチする burden_ratio を検索
const burdenRatio = rules.burdenRatios.find(br => br.effective_month === yearMonth);
appliedBurdenRatioId = burdenRatio?.id || null;
```

### 2ユーザー按分計算

**旧実装（transactionProcessor.ts:61-76）:**

```typescript
if (burdenRatio && rules.users.length === 2) {
  const user1 = rules.users[0];
  const user2 = rules.users[1];

  // user1 の比率を取得
  const user1RatioDetail = rules.burdenRatioDetails.find(
    d => d.burden_ratio_id === burdenRatio.id && d.user_id === user1.id
  );

  const user1Percent = user1RatioDetail?.ratio_percent ?? 50;

  // 按分金額計算（user1 は四捨五入、user2 は残り）
  const user1Share = Math.round(amount * (user1Percent / 100));
  shares[user1.id] = user1Share;
  shares[user2.id] = amount - user1Share;  // 端数は user2 へ
}
```

### 新バックエンド実装（推奨）

```typescript
interface CalculateSharesParams {
  amount: number;
  processingStatus: string;
  transactionDate: string;
  users: { id: number; name: string }[];
  userAliasMap: Map<number, string>;
  burdenRatios: { id: number; effectiveMonth: string }[];
  burdenRatioDetails: { burdenRatioId: number; userId: number; ratioPercent: number }[];
  existingShares?: { userId: number; shareAmount: number }[];
  overrides?: { userId: number; value: number; overrideType: 'PERCENT' | 'FIXED_AMOUNT' }[];
}

interface ShareResult {
  userId: number;
  amount: number;
  percent: number;
}

interface CalculateSharesResult {
  shares: ShareResult[];
  appliedBurdenRatioId: number | null;
  hasOverrides: boolean;
  source: 'override' | 'existing' | 'calculated';
}

export function calculateShares(params: CalculateSharesParams): CalculateSharesResult {
  const { amount, processingStatus, transactionDate, users, userAliasMap,
          burdenRatios, burdenRatioDetails, existingShares, overrides } = params;

  // 集計除外の場合は shares なし
  if (processingStatus.startsWith('集計除外')) {
    return { shares: [], appliedBurdenRatioId: null, hasOverrides: false, source: 'calculated' };
  }

  // 1. オーバーライドがある場合
  if (overrides && overrides.length > 0) {
    return applyOverrides(amount, users, overrides);
  }

  // 2. 既存 shares がある場合
  if (existingShares && existingShares.length > 0) {
    return {
      shares: existingShares.map(s => ({
        userId: s.userId,
        amount: s.shareAmount,
        percent: Math.round((s.shareAmount / amount) * 100),
      })),
      appliedBurdenRatioId: null,
      hasOverrides: false,
      source: 'existing',
    };
  }

  // 3. デフォルト按分計算
  // 取引日から年月を抽出
  const yearMonth = transactionDate.substring(0, 7); // YYYY-MM
  const burdenRatio = burdenRatios.find(br => br.effectiveMonth === yearMonth);

  if (processingStatus === '按分_家計') {
    return calculateHouseholdShares(amount, users, burdenRatio, burdenRatioDetails);
  }

  // 按分_{alias} の場合
  const aliasMatch = processingStatus.match(/^按分_(.+)$/);
  if (aliasMatch) {
    const targetAlias = aliasMatch[1];
    return calculateIndividualShares(amount, users, userAliasMap, targetAlias);
  }

  // フォールバック: 50/50
  return calculateEqualShares(amount, users);
}

function calculateHouseholdShares(
  amount: number,
  users: { id: number }[],
  burdenRatio: { id: number } | undefined,
  burdenRatioDetails: { burdenRatioId: number; userId: number; ratioPercent: number }[]
): CalculateSharesResult {
  if (!burdenRatio || users.length !== 2) {
    // フォールバック: 均等分割
    return calculateEqualShares(amount, users);
  }

  const user1 = users[0];
  const user2 = users[1];

  const user1Detail = burdenRatioDetails.find(
    d => d.burdenRatioId === burdenRatio.id && d.userId === user1.id
  );

  const user1Percent = user1Detail?.ratioPercent ?? 50;
  const user1Amount = Math.round(amount * (user1Percent / 100));
  const user2Amount = amount - user1Amount;

  return {
    shares: [
      { userId: user1.id, amount: user1Amount, percent: user1Percent },
      { userId: user2.id, amount: user2Amount, percent: 100 - user1Percent },
    ],
    appliedBurdenRatioId: burdenRatio.id,
    hasOverrides: false,
    source: 'calculated',
  };
}

function calculateIndividualShares(
  amount: number,
  users: { id: number }[],
  userAliasMap: Map<number, string>,
  targetAlias: string
): CalculateSharesResult {
  // alias からユーザーID を逆引き
  let targetUserId: number | null = null;
  for (const [userId, alias] of userAliasMap.entries()) {
    if (alias === targetAlias) {
      targetUserId = userId;
      break;
    }
  }

  return {
    shares: users.map(u => ({
      userId: u.id,
      amount: u.id === targetUserId ? amount : 0,
      percent: u.id === targetUserId ? 100 : 0,
    })),
    appliedBurdenRatioId: null,
    hasOverrides: false,
    source: 'calculated',
  };
}
```

---

## 3. オーバーライド適用ロジック

### オーバーライドタイプ

| タイプ | 説明 | 計算方法 |
|--------|------|----------|
| `FIXED_AMOUNT` | 固定金額 | そのまま使用 |
| `PERCENT` | 割合 | 残額に対して適用 |

### 計算順序

```
1. FIXED_AMOUNT オーバーライドを先に適用
2. 残額を計算: remainingAmount = totalAmount - sum(FIXED_AMOUNT)
3. PERCENT オーバーライドを残額に対して適用
```

### 旧実装（useTransactionManager.ts:189-197）

```typescript
if (txOverrides.length > 0) {
  // FIXED_AMOUNT の合計を計算
  let totalAllocated = txOverrides
    .filter(o => o.override_type === 'FIXED_AMOUNT')
    .reduce((sum, o) => sum + o.value, 0);

  const remainingAmount = numericAmount - totalAllocated;

  initialShares = masterData.users.map(u => {
    const override = txOverrides.find(o => o.user_id === u.id);
    if (!override) return { userId: u.id, amount: 0, percent: 0 };

    let amount = override.override_type === 'FIXED_AMOUNT'
      ? override.value
      : Math.round(remainingAmount * (override.value / 100));

    return {
      userId: u.id,
      amount,
      percent: Math.round((amount / numericAmount) * 100)
    };
  });
}
```

### 新バックエンド実装（推奨）

```typescript
function applyOverrides(
  amount: number,
  users: { id: number }[],
  overrides: { userId: number; value: number; overrideType: 'PERCENT' | 'FIXED_AMOUNT' }[]
): CalculateSharesResult {
  // 1. FIXED_AMOUNT の合計
  const fixedTotal = overrides
    .filter(o => o.overrideType === 'FIXED_AMOUNT')
    .reduce((sum, o) => sum + o.value, 0);

  const remainingAmount = amount - fixedTotal;

  // 2. 各ユーザーの金額を計算
  const shares = users.map(u => {
    const override = overrides.find(o => o.userId === u.id);
    if (!override) {
      return { userId: u.id, amount: 0, percent: 0 };
    }

    const shareAmount = override.overrideType === 'FIXED_AMOUNT'
      ? override.value
      : Math.round(remainingAmount * (override.value / 100));

    return {
      userId: u.id,
      amount: shareAmount,
      percent: Math.round((shareAmount / amount) * 100),
    };
  });

  return {
    shares,
    appliedBurdenRatioId: null,
    hasOverrides: true,
    source: 'override',
  };
}
```

---

## 4. カテゴリ集計ロジック

### 集計対象

- `processing_status === '按分_家計'` の取引のみ
- `集計除外_*` は集計から除外

### 集計軸

| 集計軸 | グループ化 |
|--------|-----------|
| 大項目別 | `category.major_name` |
| コストタイプ別 | `category.cost_type` (固定/変動) |
| ユーザー別 | `shares[].userId` |

### 新バックエンド実装（推奨）

**エンドポイント:** `GET /api/transactions/summary`

```typescript
interface MonthlySummary {
  totalSpending: number;
  byCategory: Record<string, number>;  // major_name -> amount
  byCostType: Record<string, number>;  // cost_type -> amount
  userShares: Record<number, number>;  // user_id -> amount
}

export function calculateMonthlySummary(
  transactions: EnrichedTransaction[],
  categories: Category[],
  users: User[]
): MonthlySummary {
  // 家計按分の取引のみ対象
  const householdTransactions = transactions.filter(
    tx => tx.processing_status === '按分_家計'
  );

  const byCategory: Record<string, number> = {};
  const byCostType: Record<string, number> = {};
  const userShares: Record<number, number> = {};

  // 初期化
  users.forEach(u => { userShares[u.id] = 0; });

  for (const tx of householdTransactions) {
    const amount = Math.abs(tx.amount);
    const category = categories.find(c => c.id === tx.category_id);

    // 大項目別
    const majorName = category?.major_name || '未分類';
    byCategory[majorName] = (byCategory[majorName] || 0) + amount;

    // コストタイプ別
    const costType = category?.cost_type || '変動';
    byCostType[costType] = (byCostType[costType] || 0) + amount;

    // ユーザー別
    for (const share of tx.shares) {
      userShares[share.userId] = (userShares[share.userId] || 0) + share.amount;
    }
  }

  const totalSpending = Object.values(byCategory).reduce((a, b) => a + b, 0);

  return { totalSpending, byCategory, byCostType, userShares };
}
```

---

## 5. 色分けロジック

### 表示色の決定

| 色 | 条件 | 意味 |
|----|------|------|
| 赤 (#c53030) | `transaction_share_overrides` あり | 手動オーバーライド |
| グレー (#4a5568) | `transaction_shares` あり（オーバーライドなし） | 計算済み按分 |
| 緑 (#38a169) | デフォルト按分適用中 | 月別比率使用 |

### 旧実装（useTransactionManager.ts:189-209）

```typescript
let sharesColor = '#38a169';  // デフォルト: 緑

if (txOverrides.length > 0) {
  sharesColor = '#c53030';  // オーバーライドあり: 赤
} else if (txShares && txShares.length > 0) {
  sharesColor = '#4a5568';  // 既存 shares あり: グレー
}
```

---

## 6. API エンドポイント設計

### 既存エンドポイントの拡張

#### `GET /api/transactions` (enriched)

**レスポンス:**

```typescript
interface EnrichedTransaction {
  // 基本情報
  id: number;
  moneyforward_id: string;
  transaction_date: string;
  content: string;
  amount: number;
  category_id: number;
  processing_status: string;
  memo: string | null;

  // カテゴリ情報（バックエンドで付与）
  category: {
    major_name: string;
    minor_name: string;
    cost_type: string;
  } | null;

  // 按分情報（バックエンドで計算）
  shares: {
    userId: number;
    amount: number;
    percent: number;
  }[];
  hasOverrides: boolean;
  sharesColor: string;
  appliedBurdenRatioId: number | null;

  // タグ情報
  tags: { id: number; name: string; color: string }[];
}
```

#### `GET /api/transactions/summary`

**クエリパラメータ:**

- `year`: 年 (YYYY)
- `month`: 月 (MM)
- `includeTagged`: タグ付き取引を含めるか (boolean)

**レスポンス:**

```typescript
interface MonthlySummaryResponse {
  totalSpending: number;
  byCategory: Record<string, number>;
  byCostType: Record<string, number>;
  userShares: Record<string, number>;
  transactionCount: number;
}
```

---

## 7. 実装計画

### Phase 1: ビジネスロジックモジュール作成

1. `backend/src/lib/business-logic.ts` 作成
2. `determineProcessingStatus()` 実装
3. `calculateShares()` 実装
4. `calculateMonthlySummary()` 実装
5. ユニットテスト作成

### Phase 2: エンドポイント拡張

1. `GET /api/transactions` を enriched 版に拡張
2. `GET /api/transactions/summary` の計算をバックエンドに移行
3. `POST /api/import/parse` で processing_status 判定を実行

### Phase 3: フロントエンド簡素化

1. `frontend/src/routes/comparison.tsx` のカテゴリ集計ロジック削除
2. `frontend/src/routes/transactions.tsx` の按分計算ロジック削除
3. API レスポンスをそのまま表示に使用

---

## 8. テスト要件

### ユニットテスト

```typescript
describe('determineProcessingStatus', () => {
  it('振替の場合、集計除外_振替を返す', () => {
    const result = determineProcessingStatus({
      isTransfer: true,
      isCalculationTarget: true,
      memo: null,
      majorName: '食費',
      minorName: '外食',
      userAliases: ['太郎'],
      exclusionRules: [],
    });
    expect(result.status).toBe('集計除外_振替');
  });

  it('メモがユーザー別名で始まる場合、按分_{alias}を返す', () => {
    const result = determineProcessingStatus({
      isTransfer: false,
      isCalculationTarget: true,
      memo: '太郎のお小遣い',
      majorName: '日用品',
      minorName: 'その他',
      userAliases: ['太郎', '花子'],
      exclusionRules: [],
    });
    expect(result.status).toBe('按分_太郎');
    expect(result.targetUserAlias).toBe('太郎');
  });
});

describe('calculateShares', () => {
  it('按分_家計の場合、月別比率で分割する', () => {
    const result = calculateShares({
      amount: 10000,
      processingStatus: '按分_家計',
      transactionDate: '2025-01-15',
      users: [{ id: 1, name: 'User1' }, { id: 2, name: 'User2' }],
      userAliasMap: new Map(),
      burdenRatios: [{ id: 1, effectiveMonth: '2025-01' }],
      burdenRatioDetails: [
        { burdenRatioId: 1, userId: 1, ratioPercent: 60 },
        { burdenRatioId: 1, userId: 2, ratioPercent: 40 },
      ],
    });
    expect(result.shares[0].amount).toBe(6000);
    expect(result.shares[1].amount).toBe(4000);
  });
});
```

---

## 参考資料

- 旧実装: `/Users/fukushima/FAL/GitHub/Kakeibo-Batch-Processor/src/services/transactionProcessor.ts`
- 旧実装: `/Users/fukushima/FAL/GitHub/Kakeibo-Batch-Processor/src/hooks/useTransactionManager.ts`
- 機能仕様: `.docs/FEATURE_SPECIFICATION.md`
- ダッシュボード仕様: `.docs/DASHBOARDING_SPEC.md`
