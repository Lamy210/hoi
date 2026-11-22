import {test,expect} from '@playwright/test';
test('師団詳細に装備型番の保有量を表示し総保有数と区別する',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  await page.getByTestId('roster-mode-list').click();
  const first=page.getByTestId('unit-roster').locator('[data-testid^="unit-roster-"]').first();
  const id=(await first.getAttribute('data-testid'))!.replace('unit-roster-','');
  // Select the direct parent of the specific division button.
  await first.locator('..').locator('details.unit-resources-details summary').click();
  await expect(page.getByTestId('issued-models-'+id)).toBeVisible();
  await expect(page.getByTestId('issued-models-'+id)).toContainText('師団保有の装備型番');
  await expect(page.getByTestId('issued-models-'+id)).toContainText('型番の記録なし');
  await expect(page.getByTestId('unit-resources-'+id)).toBeVisible();
});
