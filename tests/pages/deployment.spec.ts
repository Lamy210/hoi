import { test, expect } from '@playwright/test';

test('公開用ビルドが /hoi/ で起動して地図と時間進行を提供する', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const packFailures: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/packs/') && !response.ok()) packFailures.push(response.url());
  });
  await page.goto('/hoi/?e2e=1');
  await expect(page.getByTestId('btn-new-game')).toBeVisible();
  expect(await page.evaluate(() => '__orbis' in window)).toBe(false);
  await page.getByTestId('btn-new-game').click();
  await expect(page.getByTestId('scenario-card')).toBeVisible();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  const date = page.getByTestId('date');
  await expect(date).toContainText('2026-01-01');
  await expect(page.getByTestId('map').locator('canvas').first()).toBeVisible({ timeout: 20000 });
  await page.getByTestId('speed-4').click();
  await expect(date).not.toContainText('2026-01-01', { timeout: 15000 });
  await page.getByTestId('speed-0').click();
  expect(packFailures).toEqual([]);
  expect(errors).toEqual([]);
});
