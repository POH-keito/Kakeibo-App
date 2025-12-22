import { test, expect } from '@playwright/test';

/**
 * Phase 1: Basic smoke tests
 * Verifies that the application starts and basic routing works
 * Based on TEST_STRATEGY.md Phase 1 specifications
 */

test.describe('Smoke Tests - Phase 1', () => {
  test('アプリケーションが起動する', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Kakeibo/);
  });

  test('ナビゲーションが表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();
  });
});
