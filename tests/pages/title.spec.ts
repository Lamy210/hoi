import { expect, test } from '@playwright/test';

test('タイトル画面で設定を開いて言語を切り替えられる', async ({ page }) => {
  await page.goto('/hoi/');
  await page.getByTestId('btn-title-settings').click();
  const modal = page.getByTestId('settings-modal');
  await expect(modal).toBeVisible();
  await modal.getByTestId('lang-select').selectOption('en');
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId('btn-new-game')).toHaveText('New Game', { ignoreCase: true });
});
