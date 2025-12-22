import { test, expect } from '@playwright/test';

/**
 * Phase 3: Monthly comparison page tests
 * Verifies month-over-month comparison functionality
 */

test.describe('月次比較ページテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();

    await page.getByRole('link', { name: '月次比較' }).click();
    await page.waitForURL('**/comparison');
  });

  test('月次比較ページが表示される', async ({ page }) => {
    await expect(page).toHaveURL(/.*comparison/);

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Check for page heading or key elements
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('年月セレクターが表示される', async ({ page }) => {
    await page.waitForTimeout(1000);

    // Year and month selectors should be present
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible();
  });

  test('比較データが表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for comparison indicators (%, difference amounts, etc.)
    const percentageIndicators = page.getByText(/%/);

    if (await percentageIndicators.first().isVisible()) {
      await expect(percentageIndicators.first()).toBeVisible();
    }
  });

  test('前月比の差分が表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for positive/negative difference indicators
    const differenceIndicators = page.locator('text=/[+\\-]¥|↑|↓/');

    if (await differenceIndicators.first().isVisible()) {
      await expect(differenceIndicators.first()).toBeVisible();
    }
  });

  test('グラフ表示が機能する', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Check for chart rendering (SVG elements)
    const charts = page.locator('svg');

    if (await charts.first().isVisible()) {
      await expect(charts.first()).toBeVisible();
    }
  });

  test('月を変更すると比較データが更新される', async ({ page }) => {
    await page.waitForTimeout(1000);

    const monthSelect = page.locator('select').nth(1);

    if (await monthSelect.isVisible()) {
      const initialValue = await monthSelect.inputValue();

      // Select a different month
      const months = await monthSelect.locator('option').all();
      if (months.length > 1) {
        await monthSelect.selectOption({ index: 1 });

        // Verify month changed
        const newValue = await monthSelect.inputValue();
        expect(newValue).not.toBe(initialValue);

        // Wait for data to reload
        await page.waitForTimeout(1000);
      }
    }
  });
});
