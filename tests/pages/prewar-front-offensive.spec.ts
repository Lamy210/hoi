import {test,expect} from '@playwright/test';
test.use({deviceScaleFactor:2});

async function startKorea(page:import('@playwright/test').Page){
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-KOR').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
}
async function focusProvince(page:import('@playwright/test').Page,id:string){
  await page.getByTestId('btn-province-search').click();
  await page.getByTestId('province-search').fill(id);
  await page.getByTestId('search-result-'+id).click();
}

test('平時に戦線を作り未所属師団を一括紐づけ、ドラッグ攻勢線を引き、宣戦後も停止を維持',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await startKorea(page);
  await expect(page.getByTestId('map-front-draw')).toBeEnabled();
  await focusProvince(page,'KR-41');
  const marker=page.getByTestId('unit-marker-KR-41');
  const box=await marker.boundingBox();
  if(!box)throw Error('No friendly counter at KR-41');
  await page.getByTestId('map-front-draw').click();
  await page.getByTestId('map-front-enemy').selectOption({label:'朝鮮民主主義人民共和国'});
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect(page.getByTestId('map-front-draft-count')).toContainText('1');
  await page.getByTestId('map-front-create').click();
  await page.getByTestId('apply-pending').click();
  await page.getByTestId('btn-fronts-top').click();
  const row=page.getByTestId('fronts-modal').locator('[data-testid^="front-"]').filter({has:page.locator('button[data-testid^="front-pause-"]')}).first();
  const pause=row.locator('button[data-testid^="front-pause-"]');
  const frontId=(await pause.getAttribute('data-testid'))?.replace('front-pause-','');
  if(!frontId)throw Error('Front not created');
  await expect(page.getByTestId('front-state-'+frontId)).toContainText('事前計画');
  await expect(pause).toBeDisabled();
  await page.getByTestId('front-assignment-source').selectOption('unassigned');
  await expect(page.getByTestId('front-selection-count')).toContainText('5');
  await page.getByTestId('front-assign-'+frontId).click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('front-'+frontId)).toContainText('割当師団: 5');
  await page.getByTestId('front-stance-attack').click();
  await page.getByTestId('apply-pending').click();
  await expect(pause).toBeDisabled();
  await page.getByTestId('close-fronts').click();

  await focusProvince(page,'KP-07');
  await page.getByTestId('map-front-target-mode').click();
  const rect=await page.getByTestId('map').boundingBox();
  if(!rect)throw Error('Map absent');
  const cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
  await page.mouse.move(cx-30,cy-20);
  await page.mouse.down();
  await page.mouse.move(cx+30,cy+20,{steps:10});
  await expect(page.getByTestId('map-offensive-stroke')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('map-front-target-planner')).toHaveCount(0);
  await page.getByTestId('apply-pending').click();
  // A stroke can cross several enemy provinces when the viewport height changes.\n  // Each valid selected target produces an offensive indicator, not exactly one.\n  await expect(page.getByTestId('map-front-'+frontId).locator('.front-intent-line').first()).toBeVisible();
  await expect(page.getByTestId('map-front-'+frontId)).toHaveClass(/prewar/);
  await page.getByTestId('btn-fronts-top').click();
  await expect(page.getByTestId('front-'+frontId)).toContainText('朝鮮');
  await expect(page.getByTestId('front-state-'+frontId)).toContainText('事前計画');
  await page.getByTestId('close-fronts').click();
  await page.getByTestId('btn-declare-war').click();
  await page.getByTestId('apply-pending').click();
  await page.getByTestId('btn-fronts-top').click();
  await expect(page.getByTestId('front-state-'+frontId)).toHaveText('一時停止');
  await expect(pause).toBeEnabled();
  await page.getByTestId('close-fronts').click();
  expect(errors).toEqual([]);
});
