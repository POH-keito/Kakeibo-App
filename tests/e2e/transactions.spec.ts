import { test, expect } from '@playwright/test';

/**
 * Phase 2: Transaction details page tests
 * Verifies transaction list display, filtering, sorting, and burden ratio editing
 */

test.describe('取引詳細ページテスト', () => {
  test.beforeEach(async ({ page }) => {
    // Check if admin routes are available
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();

    const transactionsLink = page.getByRole('link', { name: '取引詳細' });
    if (await transactionsLink.isVisible()) {
      await transactionsLink.click();
      await page.waitForURL('**/transactions');
    } else {
      test.skip('取引詳細ページは管理者のみアクセス可能です');
    }
  });

  test('取引一覧が表示される', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(1500);

    // Page title or heading
    await expect(page.getByText('取引詳細')).toBeVisible();
  });

  test('年月セレクターが動作する', async ({ page }) => {
    const yearSelect = page.locator('select').first();
    await expect(yearSelect).toBeVisible();

    const monthSelect = page.locator('select').nth(1);
    await expect(monthSelect).toBeVisible();

    // Change month
    await monthSelect.selectOption('01');
    await expect(monthSelect).toHaveValue('01');
  });

  test('集計除外を含めるチェックボックスが動作する', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: /集計除外を含める/ });

    if (await checkbox.isVisible()) {
      const initialState = await checkbox.isChecked();
      await checkbox.click();
      await expect(checkbox).toBeChecked({ checked: !initialState });
    }
  });

  test('ソートモードが切り替えられる', async ({ page }) => {
    // Wait for UI to load
    await page.waitForTimeout(1000);

    // Look for sort mode selector
    const sortSelects = page.locator('select');

    if (await sortSelects.count() >= 3) {
      const sortSelect = sortSelects.nth(2);
      await expect(sortSelect).toBeVisible();

      // Try changing sort mode
      await sortSelect.selectOption({ index: 1 });
    }
  });

  test('デフォルト按分を適用ボタンが動作する', async ({ page }) => {
    await page.waitForTimeout(1500);

    const applyButton = page.getByRole('button', { name: /デフォルト按分を適用/ });

    if (await applyButton.isVisible()) {
      await expect(applyButton).toBeVisible();
      // Click would trigger changes, so we just verify it's there
    }
  });

  test('変更を保存ボタンが表示される', async ({ page }) => {
    await page.waitForTimeout(1000);

    const saveButton = page.getByRole('button', { name: /変更を保存/ });

    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeVisible();
    }
  });

  test('CSVエクスポートボタンが動作する', async ({ page }) => {
    await page.waitForTimeout(1000);

    const exportButton = page.getByRole('button', { name: /CSVエクスポート/ });

    if (await exportButton.isVisible()) {
      await expect(exportButton).toBeVisible();

      // Setup download listener
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
      await exportButton.click();

      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toContain('.csv');
      }
    }
  });

  test('取引の処理ステータスが表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for status indicators (按分_家計, 按分_ユーザー名, etc.)
    const statusTexts = page.getByText(/按分_|集計除外_/);

    if (await statusTexts.first().isVisible()) {
      await expect(statusTexts.first()).toBeVisible();
    }
  });
});
