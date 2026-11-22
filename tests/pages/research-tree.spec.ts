import { expect, test } from '@playwright/test';

test('年代別研究ツリーを表示し、カテゴリ/検索で技術を発見して研究開始できる', async ({ page }) => {
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({ timeout: 30000 });
  await page.getByTestId('btn-research').click();
  await expect(page.getByTestId('research-branch-infantry')).toBeVisible();
  await expect(page.getByTestId('tech-small-arms-standard')).toBeVisible();
  await page.getByTestId('research-cat-infantry').click();
  await expect(page.getByTestId('research-branch-industry')).toHaveCount(0);
  await page.getByTestId('research-search').fill('2035');
  await expect(page.getByTestId('tech-small-arms-next')).toBeVisible();
  await expect(page.getByTestId('research-small-arms-next')).toBeDisabled();
  await page.getByTestId('research-search').fill('');
  await page.getByTestId('research-small-arms-standard').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('tech-small-arms-standard')).toHaveClass(/active/);
});
