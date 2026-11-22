import { expect, test } from '@playwright/test';
test('研究ツリーで将来の小銃モデルと実製造未対応の注意を確認する',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  await page.getByTestId('btn-research').click();
  await expect(page.getByTestId('research-unlock-infantry-rifle-2035')).toContainText('次世代小銃');
  await expect(page.getByTestId('research-tab')).toContainText('型番別の生産と補充は未対応');
});
