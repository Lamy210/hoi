import { expect, test } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

async function startJapan(page: import('@playwright/test').Page) {
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({ timeout: 30000 });
}

test('地図の師団カウンターと一覧から現在地を確認し、移動命令を出せる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await startJapan(page);
  const roster = page.getByTestId('unit-roster');
  const initial = roster.locator('[data-location="JP-13"]');
  await expect(initial).toHaveCount(1);
  const id = await initial.getAttribute('data-unit-id');
  if (!id) throw new Error('Missing initial Tokyo division');
  const row = page.getByTestId('unit-roster-' + id);
  await row.click();
  await expect(page.getByTestId('unit-location')).toContainText('JP-13');
  const marker = page.getByTestId('unit-marker-JP-13');
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('aria-pressed', 'true');
  await marker.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('map-zoom-in').click();
  await expect(marker).toBeVisible();
  await expect(page.getByTestId('date')).toHaveText('2026-01-01');
  await page.getByTestId('move-destination').selectOption({ label: '神奈川県 (JP-14)' }).catch(async () => {
    // Use stable province ID rather than relying on Japanese label spelling.
    const select = page.getByTestId('move-destination');
    const value = await select.locator('option').evaluateAll(options => (options.find(o => o.textContent?.includes('(JP-14)')) as HTMLOptionElement | undefined)?.value);
    if (!value) throw new Error('Kanagawa option unavailable');
    await select.selectOption(value);
  });
  await page.getByTestId('confirm-move').click();
  await expect(page.getByTestId('date')).toHaveText('2026-01-01');
  await expect(row).toHaveAttribute('data-location', 'JP-13');
  await page.getByTestId('apply-pending').click();
  await expect(row).toHaveAttribute('data-location', 'JP-14');
  await expect(page.getByTestId('unit-location')).toContainText('JP-14');
  await expect(page.getByTestId('unit-marker-JP-13')).toHaveCount(0);
  await expect(page.getByTestId('unit-marker-JP-14')).toBeVisible();
  expect(errors).toEqual([]);
});

test('複数師団を選択し、地図の目的州を指定して実経路を表示する', async ({ page }) => {
  await startJapan(page);
  const roster = page.getByTestId('unit-roster');
  const tokyo = await roster.locator('[data-location="JP-13"]').getAttribute('data-unit-id');
  const osaka = await roster.locator('[data-location="JP-27"]').getAttribute('data-unit-id');
  if (!tokyo || !osaka) throw new Error('Missing divisions');
  await page.getByTestId('unit-roster-' + tokyo).click();
  await page.getByTestId('unit-check-' + osaka).check();
  await expect(page.getByTestId('selected-unit-count')).toContainText('2');
  await page.getByTestId('map-reset').click();
  const marker = page.getByTestId('unit-marker-JP-04');
  await expect(marker).toBeVisible();
  await page.getByTestId('move-selected').click();
  await expect(page.getByTestId('move-hint')).toBeVisible();
  // Clicking another division counter in destination mode must issue a move, not change selection.
  await marker.click();
  await expect(page.getByTestId('selected-unit-count')).toContainText('2');
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('selected-unit-count')).toContainText('2');
  await expect(page.getByTestId('unit-roster-' + osaka)).toContainText('移動先');
  await expect(page.locator('.unit-route').first()).toBeAttached();
});
