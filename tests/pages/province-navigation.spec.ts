import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

test('州を検索・拡大し、地図クリックで選択して建設できる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({ timeout: 30000 });
  await page.keyboard.press('f');
  const search = page.getByTestId('province-search');
  await expect(search).toBeFocused();
  await search.fill('JP-01');
  await expect(page.getByTestId('search-result-JP-01')).toBeVisible();
  await search.press('Enter');
  const province = page.getByTestId('province-panel');
  await expect(province).toContainText('北海道');
  const canvas = page.getByTestId('map').locator('canvas').first();
  await expect(canvas).toHaveAttribute('data-zoom', '4');
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('Map missing');
  await page.keyboard.press('Escape');
  await expect(province).toHaveCount(0);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await expect(province).toContainText('北海道');
  await province.getByTestId('build-infra').click();
  await page.getByTestId('apply-pending').click();
  await page.getByTestId('btn-budget').click();
  const modal = page.getByTestId('budget-modal');
  await modal.getByRole('button', { name: '建設', exact: true }).click();
  await expect(modal.getByTestId('construction-tab')).toContainText('北海道');
  expect(errors).toEqual([]);
});
