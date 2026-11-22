import {test,expect} from '@playwright/test';
test('型番別の累計製造実績と現在庫を区別して表示する',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  await page.getByTestId('btn-production').click();
  const history=page.getByTestId('model-production-history');
  await expect(history).toBeVisible();
  await expect(history).toContainText('現在の倉庫残数ではありません');
  await expect(history).toContainText('記録なし');
  await expect(page.getByTestId('production-line-planner')).toBeVisible();
});
