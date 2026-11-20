import {expect,test} from '@playwright/test';

test('師団の移動先変更から停止・待機を通常UIで指示できる',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  const row=page.getByTestId('unit-roster').locator('[data-location="JP-27"]').first();
  const id=await row.getAttribute('data-unit-id');
  if(!id)throw new Error('Missing scenario division');
  const selected=page.getByTestId('unit-roster-'+id);
  await selected.click();
  const destination=page.getByTestId('move-destination');
  async function choose(province:string){
    const value=await destination.locator('option').evaluateAll((options,id)=>(options.find(o=>o.textContent?.includes('('+id+')')) as HTMLOptionElement|undefined)?.value,province);
    if(!value)throw new Error('Missing province '+province);
    await destination.selectOption(value);
  }
  await choose('JP-04');
  await page.getByTestId('confirm-move').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('movement-edit-hint')).toBeVisible();
  await expect(page.getByTestId('unit-segment-progress')).toBeVisible();
  await expect(page.getByTestId('move-selected')).toBeEnabled();
  await choose('JP-13');
  await page.getByTestId('confirm-move').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('halt-selected')).toBeEnabled();
  await page.getByTestId('halt-selected').click();
  await page.getByTestId('apply-pending').click();
  await expect(selected).toContainText('手動優先');
  await expect(page.getByTestId('resume-selected-automation')).toBeEnabled();
});
