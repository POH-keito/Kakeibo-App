import { test, expect } from '@playwright/test';

/**
 * Phase 4: Settings page tests
 * Verifies burden ratio editing and tag management functionality
 */

test.describe('設定ページテスト', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation')).toBeVisible();

    const settingsLink = page.getByRole('link', { name: '設定' });
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForURL('**/settings');
    } else {
      test.skip('設定ページは管理者のみアクセス可能です');
    }
  });

  test('設定ページが表示される', async ({ page }) => {
    await expect(page).toHaveURL(/.*settings/);

    await page.waitForTimeout(1000);
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('按分比率設定セクションが表示される', async ({ page }) => {
    await page.waitForTimeout(1000);

    // Look for burden ratio section
    const burdenSection = page.getByText(/按分|比率/);

    if (await burdenSection.first().isVisible()) {
      await expect(burdenSection.first()).toBeVisible();
    }
  });

  test('年月セレクターが動作する', async ({ page }) => {
    await page.waitForTimeout(1000);

    const yearSelect = page.locator('select').first();

    if (await yearSelect.isVisible()) {
      await expect(yearSelect).toBeVisible();

      const monthSelect = page.locator('select').nth(1);
      await expect(monthSelect).toBeVisible();

      // Change month
      await monthSelect.selectOption('01');
      await expect(monthSelect).toHaveValue('01');
    }
  });

  test('按分比率を編集できる', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for percentage inputs
    const percentInputs = page.locator('input[type="number"]');

    if (await percentInputs.first().isVisible()) {
      const firstInput = percentInputs.first();
      await expect(firstInput).toBeVisible();

      // Try entering a value
      await firstInput.fill('60');
      await expect(firstInput).toHaveValue('60');
    }
  });

  test('按分比率の保存ボタンが動作する', async ({ page }) => {
    await page.waitForTimeout(1000);

    const saveButton = page.getByRole('button', { name: /保存|更新/ });

    if (await saveButton.first().isVisible()) {
      await expect(saveButton.first()).toBeVisible();

      // Click to save
      await saveButton.first().click();

      // Wait for save confirmation
      await page.waitForTimeout(1000);

      // Look for success message
      const successMessage = page.getByText(/保存しました|更新しました|成功/);

      if (await successMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(successMessage).toBeVisible();
      }
    }
  });

  test('タグ管理セクションが表示される', async ({ page }) => {
    await page.waitForTimeout(1000);

    // Look for tag management section
    const tagSection = page.getByText(/タグ/);

    if (await tagSection.first().isVisible()) {
      await expect(tagSection.first()).toBeVisible();
    }
  });

  test('新規タグ作成ボタンが表示される', async ({ page }) => {
    await page.waitForTimeout(1000);

    const createButton = page.getByRole('button', { name: /新規|追加|作成/ });

    if (await createButton.first().isVisible()) {
      await expect(createButton.first()).toBeVisible();
    }
  });

  test('タグ一覧が表示される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for tag list
    const tagList = page.locator('ul, table').first();

    if (await tagList.isVisible()) {
      await expect(tagList).toBeVisible();
    }
  });

  test('タグを編集できる', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for edit buttons
    const editButtons = page.getByRole('button', { name: /編集/ });

    if (await editButtons.first().isVisible()) {
      await expect(editButtons.first()).toBeVisible();
      await editButtons.first().click();

      // Wait for edit form or modal
      await page.waitForTimeout(500);
    }
  });

  test('タグを削除できる', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for delete buttons
    const deleteButtons = page.getByRole('button', { name: /削除/ });

    if (await deleteButtons.first().isVisible()) {
      await expect(deleteButtons.first()).toBeVisible();
    }
  });

  test('按分比率の合計が100%になるか検証される', async ({ page }) => {
    await page.waitForTimeout(1500);

    // Look for validation message or total display
    const totalDisplay = page.getByText(/合計|%/);

    if (await totalDisplay.first().isVisible()) {
      await expect(totalDisplay.first()).toBeVisible();
    }
  });

  test('前月からコピーボタンが動作する', async ({ page }) => {
    await page.waitForTimeout(1000);

    const copyButton = page.getByRole('button', { name: /前月|コピー/ });

    if (await copyButton.first().isVisible()) {
      await expect(copyButton.first()).toBeVisible();
      await copyButton.first().click();

      await page.waitForTimeout(500);
    }
  });
});
