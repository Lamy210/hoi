import {test,expect} from '@playwright/test';

test('装備生産画面は型番別残数と未分類残数を二重計上せずに表示する',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  await page.getByTestId('btn-production').click();
  const inventory=page.getByTestId('model-warehouse-inventory');
  await expect(inventory).toBeVisible();
  await expect(inventory).toContainText('総備蓄に含まれる内訳');
  await expect(page.getByTestId('model-stock-unclassified-infantry')).toBeVisible();
  await expect(page.getByTestId('model-stock-unclassified-artillery')).toBeVisible();
  await expect(page.getByTestId('model-production-history')).toBeVisible();
  await page.getByTestId('mode-lines').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('mode-lines')).toHaveAttribute('aria-pressed','true');
});
