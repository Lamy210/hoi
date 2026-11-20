import { expect, test } from '@playwright/test';

test('通常UIで交戦前後の攻撃可否と戦闘への進行を確認する', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-KOR').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  const unit = page.getByTestId('unit-roster').locator('[data-location="KR-41"]').first();
  const id = await unit.getAttribute('data-unit-id');
  if (!id) throw new Error('Missing scenario division');
  const row = page.getByTestId('unit-roster-' + id);
  await row.click();
  await expect(page.getByTestId('attack-selected')).toBeDisabled();
  await page.getByTestId('btn-province-search').click();
  await page.getByTestId('province-search').fill('KP-07');
  await page.getByTestId('search-result-KP-07').click();
  await page.getByTestId('btn-declare-war').click();
  await page.getByTestId('apply-pending').click();
  await row.click();
  await expect(page.getByTestId('attack-selected')).toBeEnabled();
  await expect(page.getByTestId('unit-marker-KP-07')).toHaveAttribute('data-hostile-count','1');
  await page.getByTestId('attack-selected').click();
  const select = page.getByTestId('move-destination');
  const value = await select.locator('option').evaluateAll(options => (options.find(o => o.textContent?.includes('(KP-07)')) as HTMLOptionElement | undefined)?.value);
  if (!value) throw new Error('Attack target unavailable');
  await select.selectOption(value);
  await page.getByTestId('confirm-attack').click();
  await expect(row).toHaveAttribute('data-location','KR-41');
  await page.getByTestId('apply-pending').click();
  // Depending on the scenario movement duration, the unit is advancing or has already arrived.
  await expect.poll(async () => {
    const loc = await row.getAttribute('data-location');
    return loc === 'KP-07' || (await row.innerText()).includes('移動先');
  }).toBe(true);
  expect(errors).toEqual([]);
});
