import {test,expect} from '@playwright/test';
test.use({deviceScaleFactor:2});

async function korea(page:import('@playwright/test').Page){
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-KOR').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
}
async function focus(page:import('@playwright/test').Page,code:string){
  await page.getByTestId('btn-province-search').click();
  await page.getByTestId('province-search').fill(code);
  await page.getByTestId('search-result-'+code).click();
}
async function clickUnitMarker(page:import('@playwright/test').Page,code:string){
  const marker=page.getByTestId('unit-marker-'+code);
  await expect(marker).toBeVisible();
  const box=await marker.boundingBox();
  if(!box)throw Error('No province marker '+code);
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
}

test('既存戦線の州範囲を地図から編集・プレビュー・キャンセル・確定',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await korea(page);
  await focus(page,'KR-41');
  await page.getByTestId('map-front-draw').click();
  await page.getByTestId('map-front-enemy').selectOption({label:'朝鮮民主主義人民共和国'});
  await clickUnitMarker(page,'KR-41');
  await page.getByTestId('map-front-create').click();
  await page.getByTestId('apply-pending').click();
  await page.getByTestId('btn-fronts-top').click();
  const pause=page.getByTestId('fronts-modal').locator('button[data-testid^="front-pause-"]').first();
  const id=(await pause.getAttribute('data-testid'))?.replace('front-pause-','');
  if(!id)throw Error('Front ID missing');
  await page.getByTestId('close-fronts').click();
  await expect(page.getByTestId('map-front-'+id).locator('.front-province')).toHaveCount(1);
  await page.getByTestId('map-front-edit').click();
  await expect(page.getByTestId('map-front-edit-select')).toHaveValue(id);
  await expect(page.getByTestId('map-front-save')).toBeDisabled();
  await focus(page,'KR-11');
  await clickUnitMarker(page,'KR-11');
  await expect(page.getByTestId('map-front-edit-preview')).toContainText('追加: 1');
  await expect(page.getByTestId('map-front-save')).toBeEnabled();
  await page.getByTestId('map-front-edit-cancel').click();
  await expect(page.getByTestId('map-front-'+id).locator('.front-province')).toHaveCount(1);
  await page.getByTestId('map-front-edit').click();
  await focus(page,'KR-11');
  await clickUnitMarker(page,'KR-11');
  await page.getByTestId('map-front-save').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('map-front-draft')).toHaveCount(0);
  await expect(page.getByTestId('map-front-'+id).locator('.front-province')).toHaveCount(2);
  await page.getByTestId('btn-fronts-top').click();
  await expect(page.getByTestId('front-state-'+id)).toContainText('事前計画');
  await page.getByTestId('close-fronts').click();
  expect(errors).toEqual([]);
});
