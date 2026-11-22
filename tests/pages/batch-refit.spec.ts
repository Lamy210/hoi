import {expect,test} from '@playwright/test';

test('複数師団を選択して一括改編し、資源差分と編成を確認する',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  await page.getByTestId('btn-recruit').click();
  await page.getByTestId('open-division-designer').click();
  await page.getByTestId('custom-template-name').fill('一括改編');
  for(let i=0;i<4;i++)await page.getByTestId('remove-infantry-v1').click();
  await page.getByTestId('save-custom-template').click();
  await page.getByTestId('apply-pending').click();
  await page.getByTestId('recruit-modal').getByRole('button',{name:'閉じる'}).click();
  const roster=page.getByTestId('unit-roster');
  const ids=await roster.locator('[data-unit-id]').evaluateAll(rows=>rows.map(r=>r.getAttribute('data-unit-id')!));
  expect(ids.length).toBeGreaterThanOrEqual(2);
  await page.getByTestId('unit-roster-'+ids[0]).click();
  await page.getByTestId('unit-check-'+ids[1]).check();
  await expect(page.getByTestId('selected-unit-count')).toContainText('2');
  await page.getByTestId('army-quick-template').selectOption('1:1');
  await expect(page.getByTestId('army-batch-preview')).toBeVisible();
  await expect(page.getByTestId('army-batch-refit')).toBeEnabled();
  await page.getByTestId('army-batch-refit').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('army-quick-action')).toContainText('全件成功');
  // Both identities remain; the existing unit panels pick up the new template revision.
  await page.getByTestId('unit-roster-'+ids[0]).click();
  await expect(page.getByTestId('army-quick-action')).toContainText('1 v1');
  await page.getByTestId('unit-roster-'+ids[1]).click();
  await expect(page.getByTestId('army-quick-action')).toContainText('1 v1');
});
