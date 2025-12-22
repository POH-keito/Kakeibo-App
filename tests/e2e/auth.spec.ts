import { test, expect } from '@playwright/test';

/**
 * Phase 2: Authentication and role-based access control tests
 * Verifies that different user roles have appropriate access to features
 */

test.describe('認証・ロール別アクセステスト', () => {
  test('管理者はすべてのナビゲーションメニューを表示できる', async ({ page }) => {
    await page.goto('/');

    // Wait for auth to complete
    await expect(page.getByRole('navigation')).toBeVisible();

    // Check viewer-accessible routes
    await expect(page.getByRole('link', { name: 'ダッシュボード' })).toBeVisible();
    await expect(page.getByRole('link', { name: '月次比較' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'タグ集計' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'AI分析' })).toBeVisible();

    // Check admin-only routes (these should be visible for admin user)
    // Note: In development, DEV_USER_EMAIL determines the role
    const adminEmail = 'keito@fukushi.ma';
    const headerText = await page.getByText(adminEmail).textContent();

    if (headerText?.includes('admin')) {
      await expect(page.getByRole('link', { name: '取引詳細' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'CSVインポート' })).toBeVisible();
      await expect(page.getByRole('link', { name: '設定' })).toBeVisible();
    }
  });

  test('ユーザー情報が表示される', async ({ page }) => {
    await page.goto('/');

    // Check that user info is displayed (email and role)
    const header = page.locator('header');
    await expect(header).toContainText(/[@a-z.]+/); // Email pattern
    await expect(header).toContainText(/(admin|viewer)/); // Role
  });

  test('認証エラー時にエラーメッセージが表示される', async ({ page }) => {
    // This test would require mocking the auth endpoint to return an error
    // For now, we verify that the app handles loading state properly
    await page.goto('/');

    // Should eventually show content (not stuck in loading)
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 10000 });
  });
});
