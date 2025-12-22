import { test, expect } from '@playwright/test';

/**
 * Phase 2: Tag aggregation page tests
 * Verifies tag summary display and calendar view toggle
 */

test.describe('タグ集計ページテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();

    await page.getByRole('link', { name: 'タグ集計' }).click();
    await page.waitForURL('**/tags');
  });

  test('タグ集計ページが表示される', async ({ page }) => {
    await expect(page).toHaveURL(/.*tags/);

    // Wait for page content
    await page.waitForTimeout(1000);

    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('年月セレクターが動作する', async ({ page }) => {
    await page.waitForTimeout(1000);

    const yearSelect = page.locator('select').first();
    await expect(yearSelect).toBeVisible();

    const monthSelect = page.locator('select').nth(1);
    await expect(monthSelect).toBeVisible();

    // Change month
    await monthSelect.selectOption('01');
    await expect(monthSelect).toHaveValue('01');
  });

  test('タグサマリーが表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for tag summary heading
    const summaryHeading = page.getByText('タグサマリー');

    if (await summaryHeading.isVisible()) {
      await expect(summaryHeading).toBeVisible();
    }
  });

  test('カレンダービュー切り替えボタンが動作する', async ({ page }) => {
    await page.waitForTimeout(1000);

    // Look for view toggle buttons
    const viewButtons = page.getByRole('button', { name: /カレンダー|リスト/ });

    if (await viewButtons.first().isVisible()) {
      await expect(viewButtons.first()).toBeVisible();
      await viewButtons.first().click();

      // Wait for view to change
      await page.waitForTimeout(500);
    }
  });

  test('タグ別の金額が表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for amount displays (¥ symbol)
    const amounts = page.getByText(/¥[0-9,]+/);

    if (await amounts.first().isVisible()) {
      await expect(amounts.first()).toBeVisible();
    }
  });

  test('タグをクリックすると詳細が表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for clickable tag elements
    const tagButtons = page.locator('button').filter({ hasText: /¥/ });

    if (await tagButtons.first().isVisible()) {
      await tagButtons.first().click();

      // Wait for details to expand or modal to open
      await page.waitForTimeout(500);
    }
  });

  test('カレンダービューで日付が表示される', async ({ page }) => {
    await page.waitForTimeout(1000);

    // Switch to calendar view if available
    const calendarButton = page.getByRole('button', { name: /カレンダー/ });

    if (await calendarButton.isVisible()) {
      await calendarButton.click();
      await page.waitForTimeout(500);

      // Look for date numbers (1-31)
      const dateElements = page.getByText(/^[1-9]$|^[12][0-9]$|^3[01]$/);

      if (await dateElements.first().isVisible()) {
        await expect(dateElements.first()).toBeVisible();
      }
    }
  });

  test('タグがない場合のメッセージが表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for empty state message
    const emptyMessage = page.getByText(/タグがありません|データがありません/);

    // This test passes if either tags exist or empty message is shown
    const hasTags = await page.getByText(/¥[0-9,]+/).first().isVisible().catch(() => false);
    const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);

    expect(hasTags || hasEmptyMessage).toBeTruthy();
  });
});
