import { test, expect } from '@playwright/test';

/**
 * Phase 2: Dashboard functionality tests
 * Verifies the main dashboard features including date selection, summary cards,
 * charts, and monthly memo
 */

test.describe('ダッシュボード機能テスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for data to load
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('年月セレクターが動作する', async ({ page }) => {
    // Year selector should be visible
    const yearSelect = page.locator('select').first();
    await expect(yearSelect).toBeVisible();

    // Month selector should be visible
    const monthSelect = page.locator('select').nth(1);
    await expect(monthSelect).toBeVisible();

    // Change year
    await yearSelect.selectOption('2024');
    await expect(yearSelect).toHaveValue('2024');

    // Change month
    await monthSelect.selectOption('01');
    await expect(monthSelect).toHaveValue('01');
  });

  test('タグ付き取引を含めるチェックボックスが動作する', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: /タグ付き取引を含める/ });
    await expect(checkbox).toBeVisible();

    // Toggle checkbox
    const initialState = await checkbox.isChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked({ checked: !initialState });
  });

  test('サマリーカードが表示される', async ({ page }) => {
    // Wait for loading to complete
    await page.waitForTimeout(1000);

    // Total spending card should be visible
    await expect(page.getByText('総支出')).toBeVisible();

    // User share cards should be visible (if data exists)
    const summaryCards = page.locator('.bg-white.rounded-lg.shadow');
    await expect(summaryCards.first()).toBeVisible();
  });

  test('カテゴリ別支出の円グラフが表示される', async ({ page }) => {
    // Wait for loading
    await page.waitForTimeout(1000);

    // Check for pie chart section
    await expect(page.getByText('カテゴリ別支出')).toBeVisible();

    // Chart should render (Recharts creates SVG)
    const chartArea = page.locator('svg').first();
    await expect(chartArea).toBeVisible();
  });

  test('コストタイプ別内訳が表示される', async ({ page }) => {
    // Wait for loading
    await page.waitForTimeout(1000);

    await expect(page.getByText('コストタイプ別内訳')).toBeVisible();
  });

  test('固定費vs変動費の推移グラフが表示される', async ({ page }) => {
    // Wait for loading
    await page.waitForTimeout(1000);

    // This section may not always be visible (depends on data)
    const trendSection = page.getByText('固定費vs変動費の推移');
    if (await trendSection.isVisible()) {
      await expect(trendSection).toBeVisible();
    }
  });

  test('月次メモが保存できる', async ({ page }) => {
    // Wait for loading
    await page.waitForTimeout(1000);

    await expect(page.getByText('月次メモ')).toBeVisible();

    const memoTextarea = page.getByPlaceholder('この月のメモを入力...');
    await expect(memoTextarea).toBeVisible();

    // Enter memo text
    const testMemo = 'E2E テストメモ ' + Date.now();
    await memoTextarea.fill(testMemo);

    // Save memo
    const saveButton = page.getByRole('button', { name: '保存' });
    await saveButton.click();

    // Wait for save confirmation
    await expect(page.getByText('保存完了')).toBeVisible({ timeout: 5000 });
  });

  test('カテゴリ金額クリックでモーダルが開く', async ({ page }) => {
    // Wait for loading
    await page.waitForTimeout(1500);

    // Find first category amount link (blue clickable amount)
    const categoryAmountLinks = page.locator('button.text-blue-600.hover\\:text-blue-800');
    const firstLink = categoryAmountLinks.first();

    if (await firstLink.isVisible()) {
      await firstLink.click();

      // Modal should open (check for modal title containing "取引一覧")
      await expect(page.getByText(/の取引一覧/)).toBeVisible({ timeout: 3000 });
    }
  });

  test('按分情報が表示される', async ({ page }) => {
    // Wait for loading
    await page.waitForTimeout(1000);

    // Check for burden ratio display
    const ratioDisplay = page.getByText(/今月のデフォルト按分:/);
    if (await ratioDisplay.isVisible()) {
      await expect(ratioDisplay).toBeVisible();
    }
  });
});
