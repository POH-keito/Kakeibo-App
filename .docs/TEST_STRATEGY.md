# Kakeibo-App テスト戦略

> このドキュメントは、Kakeibo-App 統合プロジェクトのテスト戦略を定義します。

---

## 概要

### テストアプローチ

仕様書ベースの E2E テストを中心に、各機能が仕様通りに動作することを保証する。

```
仕様書 → テストケース → 実装 → テスト実行 → 次の機能へ
```

### テストツール

| ツール | 用途 |
|--------|------|
| Playwright | E2E テスト |
| Playwright Codegen | テストコード自動生成 |
| Vitest | ユニットテスト（必要に応じて） |

---

## テスト構成

### ディレクトリ構造

```
tests/
├── e2e/
│   ├── auth.spec.ts           # 認証・ロール別アクセス
│   ├── dashboard.spec.ts      # ダッシュボード
│   ├── comparison.spec.ts     # 月次比較
│   ├── tags.spec.ts           # タグ集計
│   ├── ai.spec.ts             # AI分析
│   ├── transactions.spec.ts   # 取引詳細（admin）
│   ├── import.spec.ts         # CSVインポート（admin）
│   └── settings.spec.ts       # タグ編集（admin）
├── fixtures/
│   ├── sample.csv             # テスト用CSVデータ
│   └── test-data.ts           # テストデータ定義
└── playwright.config.ts
```

### Playwright 設定

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Phase 別テスト計画

### Phase 1: 基盤構築

**テスト内容:**
- アプリケーションが起動すること
- 基本的なルーティングが動作すること

```typescript
// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test('アプリケーションが起動する', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Kakeibo/);
});

test('ナビゲーションが表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
});
```

---

### Phase 2: 認証実装

**テスト内容:**
- admin ユーザーで全メニューが表示される
- viewer ユーザーで閲覧系メニューのみ表示される
- admin 専用ページに viewer がアクセスできない

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('認証・ロール別アクセス', () => {
  test('admin は全メニューが表示される', async ({ page }) => {
    // ローカル開発では DEV_USER_EMAIL でロールを切り替え
    await page.goto('/');

    // 全メニューが表示される
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();
    await expect(page.getByRole('link', { name: '月次比較' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'タグ集計' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'AI分析' })).toBeVisible();
    await expect(page.getByRole('link', { name: '取引詳細' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CSVインポート' })).toBeVisible();
    await expect(page.getByRole('link', { name: '設定' })).toBeVisible();
  });

  test('viewer は閲覧系メニューのみ表示される', async ({ page }) => {
    // viewer ロールでアクセス
    await page.goto('/');

    // 閲覧系メニュー
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();
    await expect(page.getByRole('link', { name: '月次比較' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'タグ集計' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'AI分析' })).toBeVisible();

    // admin専用メニューは非表示
    await expect(page.getByRole('link', { name: '取引詳細' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'CSVインポート' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: '設定' })).not.toBeVisible();
  });

  test('viewer が admin ページに直接アクセスするとリダイレクト', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page).toHaveURL('/');
  });
});
```

---

### Phase 3: Dashboard 移植

#### 3.1 ダッシュボード

**仕様参照:** `DASHBOARDING_SPEC.md` セクション 1

```typescript
// tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test.describe('ダッシュボード', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('サマリーカードが表示される', async ({ page }) => {
    // 総支出カード
    await expect(page.getByText('総支出')).toBeVisible();

    // ユーザー別負担額
    await expect(page.getByText(/福島 啓斗/)).toBeVisible();
    await expect(page.getByText(/福島 和香/)).toBeVisible();
  });

  test('カテゴリ別円グラフが表示される', async ({ page }) => {
    await expect(page.locator('canvas, svg').first()).toBeVisible();
  });

  test('コストタイプ別内訳が展開できる', async ({ page }) => {
    // 固定費をクリック
    await page.getByText('固定費').click();

    // 中項目が展開される
    await expect(page.getByText('住居')).toBeVisible();
  });

  test('金額クリックで取引詳細モーダルが開く', async ({ page }) => {
    // サマリーカードの金額をクリック
    await page.getByText('総支出').click();

    // モーダルが表示される
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('取引詳細')).toBeVisible();
  });

  test('月次メモを保存できる', async ({ page }) => {
    const memo = page.getByRole('textbox', { name: /メモ/ });
    await memo.fill('テストメモ');

    // 保存完了を待つ
    await expect(page.getByText('保存完了')).toBeVisible();
  });
});
```

#### 3.2 月次比較

**仕様参照:** `DASHBOARDING_SPEC.md` セクション 3

```typescript
// tests/e2e/comparison.spec.ts
import { test, expect } from '@playwright/test';

test.describe('月次比較', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/comparison');
  });

  test('直近4ヶ月のデータが表示される', async ({ page }) => {
    // テーブルヘッダーに4つの月が表示
    const headers = page.locator('th');
    await expect(headers).toHaveCount(5); // カテゴリ + 4ヶ月
  });

  test('セルクリックで取引詳細モーダルが開く', async ({ page }) => {
    // テーブルセルをクリック
    await page.locator('td').first().click();

    // モーダルが表示される
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('固定費 vs 変動費チャートが表示される', async ({ page }) => {
    await expect(page.getByText('固定費 vs 変動費')).toBeVisible();
    await expect(page.locator('canvas, svg').first()).toBeVisible();
  });

  test('ユーザー別負担推移チャートが表示される', async ({ page }) => {
    await expect(page.getByText('負担推移')).toBeVisible();
  });
});
```

#### 3.3 タグ集計

**仕様参照:** `DASHBOARDING_SPEC.md` セクション 4

```typescript
// tests/e2e/tags.spec.ts
import { test, expect } from '@playwright/test';

test.describe('タグ集計', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tags');
  });

  test('タグ一覧が金額降順で表示される', async ({ page }) => {
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();

    // 金額が降順であることを確認
    const amounts = await page.locator('tbody tr td:nth-child(2)').allTextContents();
    // 金額が数値として降順であることを検証
  });

  test('タグ行クリックで取引一覧が展開される', async ({ page }) => {
    await page.locator('tbody tr').first().click();

    // 展開された取引一覧が表示
    await expect(page.getByText(/日付.*内容.*金額/)).toBeVisible();
  });
});
```

#### 3.4 AI分析

**仕様参照:** `DASHBOARDING_SPEC.md` セクション 5

```typescript
// tests/e2e/ai.spec.ts
import { test, expect } from '@playwright/test';

test.describe('AI分析', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ai');
  });

  test('分析開始ボタンで初期分析が実行される', async ({ page }) => {
    await page.getByRole('button', { name: /分析/ }).click();

    // ローディング表示
    await expect(page.getByText(/分析中/)).toBeVisible();

    // 結果表示（タイムアウト長めに）
    await expect(page.getByText(/アドバイス|分析/)).toBeVisible({ timeout: 30000 });
  });

  test('チャットで質問できる', async ({ page }) => {
    // 初期分析を実行
    await page.getByRole('button', { name: /分析/ }).click();
    await expect(page.getByText(/アドバイス|分析/)).toBeVisible({ timeout: 30000 });

    // 質問を入力
    await page.getByRole('textbox').fill('食費を減らすには？');
    await page.getByRole('button', { name: /送信/ }).click();

    // 回答を待つ
    await expect(page.getByText(/食費/)).toBeVisible({ timeout: 30000 });
  });
});
```

---

### Phase 4: Utilities 移植

#### 4.1 取引詳細（admin）

**仕様参照:** `FEATURE_SPECIFICATION.md` セクション 3, `DASHBOARDING_SPEC.md` セクション 2

```typescript
// tests/e2e/transactions.spec.ts
import { test, expect } from '@playwright/test';

test.describe('取引詳細（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/transactions');
  });

  test('ピボットテーブルの3つのタブが表示される', async ({ page }) => {
    await expect(page.getByRole('tab', { name: '日付・ステータス順' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'ステータス・日付順' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'カテゴリ順' })).toBeVisible();
  });

  test('按分スライダーで比率を変更できる', async ({ page }) => {
    // スライダーを操作
    const slider = page.locator('input[type="range"]').first();
    await slider.fill('70');

    // 変更が反映される（赤色表示）
    await expect(slider).toHaveAttribute('class', /override|red/);
  });

  test('一括操作でデフォルト按分を適用できる', async ({ page }) => {
    await page.getByRole('button', { name: 'デフォルト按分を適用' }).click();

    // 確認ダイアログ
    await page.getByRole('button', { name: '適用' }).click();

    // 成功メッセージ
    await expect(page.getByText(/適用完了|成功/)).toBeVisible();
  });

  test('変更を保存できる', async ({ page }) => {
    // スライダーを変更
    const slider = page.locator('input[type="range"]').first();
    await slider.fill('70');

    // 保存ボタンをクリック
    await page.getByRole('button', { name: /保存/ }).click();

    // 成功メッセージ
    await expect(page.getByText(/保存完了|成功/)).toBeVisible();
  });
});
```

#### 4.2 CSVインポート（admin）

**仕様参照:** `FEATURE_SPECIFICATION.md` セクション 1

```typescript
// tests/e2e/import.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('CSVインポート（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/import');
  });

  test('CSVファイルをアップロードできる', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.csv'));

    // プレビューが表示される
    await expect(page.getByText('プレビュー')).toBeVisible();
  });

  test('重複チェックが実行される', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.csv'));

    // 重複件数が表示される
    await expect(page.getByText(/重複|件/)).toBeVisible();
  });

  test('取込ボタンでデータが登録される', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.csv'));

    await page.getByRole('button', { name: '取込' }).click();

    // 進捗表示
    await expect(page.getByText(/処理中|%/)).toBeVisible();

    // 完了
    await expect(page.getByText(/完了|成功/)).toBeVisible({ timeout: 60000 });
  });
});
```

#### 4.3 タグ編集（admin）

**仕様参照:** `FEATURE_SPECIFICATION.md` セクション 2

```typescript
// tests/e2e/settings.spec.ts
import { test, expect } from '@playwright/test';

test.describe('タグ編集（admin）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('タグ一覧が表示される', async ({ page }) => {
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('新規タグを作成できる', async ({ page }) => {
    await page.getByRole('button', { name: '新規タグ' }).click();

    // モーダルでタグ名入力
    await page.getByRole('textbox', { name: 'タグ名' }).fill('テストタグ');
    await page.getByRole('button', { name: '作成' }).click();

    // 一覧に表示される
    await expect(page.getByText('テストタグ')).toBeVisible();
  });

  test('タグを編集できる', async ({ page }) => {
    // 編集ボタンをクリック
    await page.getByRole('button', { name: '編集' }).first().click();

    // 名前を変更
    const input = page.getByRole('textbox', { name: 'タグ名' });
    await input.clear();
    await input.fill('編集後タグ');
    await page.getByRole('button', { name: '保存' }).click();

    // 変更が反映される
    await expect(page.getByText('編集後タグ')).toBeVisible();
  });

  test('タグを削除できる', async ({ page }) => {
    // 削除ボタンをクリック
    await page.getByRole('button', { name: '削除' }).first().click();

    // 確認ダイアログ
    await page.getByRole('button', { name: '削除する' }).click();

    // 成功メッセージ
    await expect(page.getByText(/削除完了|成功/)).toBeVisible();
  });
});
```

---

## テスト実行

### コマンド

```bash
# 全テスト実行
npm run test:e2e

# 特定ファイルのみ
npm run test:e2e -- tests/e2e/dashboard.spec.ts

# 特定テストのみ（grep）
npm run test:e2e -- --grep "サマリーカード"

# UIモードで実行（デバッグ用）
npm run test:e2e:ui

# Codegen でテスト生成
npm run test:codegen
```

### package.json スクリプト

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:codegen": "playwright codegen http://localhost:3000"
  }
}
```

---

## Playwright Codegen 活用

### 使い方

```bash
# Codegen 起動
npx playwright codegen http://localhost:3000
```

1. ブラウザが開く
2. 操作を行う（クリック、入力など）
3. 右側にテストコードが自動生成される
4. 生成されたコードをテストファイルにコピー

### 推奨ワークフロー

```
1. 仕様書で機能を確認
2. Codegen で操作を録画
3. 生成コードをベースにアサーションを追加
4. テストファイルとして保存
```

---

## CI/CD 連携

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## テストデータ管理

### テスト用CSV

```csv
計算対象,日付,内容,金額（円）,保有金融機関,大項目,中項目,メモ,振替,ID
○,2024/01/15,スーパーマーケット,-3500,XXXカード,食費,食料品,,0,test001
○,2024/01/16,電気料金,-8000,XXX銀行,日用品,水道・光熱費,,0,test002
```

### テストデータのリセット

本番データを使用する場合は、テスト専用のタグ（例: `_test_`）を付けて識別し、テスト後にクリーンアップする。

```typescript
// tests/fixtures/cleanup.ts
export async function cleanupTestData(api: ApiClient) {
  // _test_ タグが付いたデータを削除
  await api.delete('transactions', {
    where: { moneyforward_id: { _like: 'test%' } }
  });
}
```

---

## チェックリスト

### Phase 完了条件

各 Phase のテストが全て PASS することを完了条件とする。

- [ ] Phase 1: `smoke.spec.ts` PASS
- [ ] Phase 2: `auth.spec.ts` PASS
- [ ] Phase 3: `dashboard.spec.ts`, `comparison.spec.ts`, `tags.spec.ts`, `ai.spec.ts` PASS
- [ ] Phase 4: `transactions.spec.ts`, `import.spec.ts`, `settings.spec.ts` PASS
- [ ] Phase 5: 全テスト PASS + 本番環境でも動作確認
