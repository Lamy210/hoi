import {test,expect} from '@playwright/test';

test.use({deviceScaleFactor:2});

async function startWar(page:import('@playwright/test').Page){
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-KOR').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  await focusProvince(page,'KP-07');
  await page.getByTestId('btn-declare-war').click();
  await page.getByTestId('apply-pending').click();
}

async function focusProvince(page:import('@playwright/test').Page,code:string){
  await page.getByTestId('btn-province-search').click();
  await page.getByTestId('province-search').fill(code);
  await page.getByTestId('search-result-'+code).click();
}

test('地図クリックで手動戦線を作り、地図から敵地の攻勢目標を登録できる',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await startWar(page);
  await focusProvince(page,'KR-41');
  const marker=page.getByTestId('unit-marker-KR-41');
  await expect(marker).toBeVisible();
  const point=await marker.boundingBox();
  if(!point)throw Error('Missing frontline province counter');
  await page.getByTestId('map-front-draw').click();
  await expect(page.getByTestId('map-front-create')).toBeDisabled();
  await page.mouse.click(point.x+point.width/2,point.y+point.height/2);
  await expect(page.getByTestId('map-front-draft-count')).toContainText('1');
  await expect(page.getByTestId('map-front-draft').locator('.front-province')).toHaveCount(1);
  await expect(page.getByTestId('map-front-create')).toBeEnabled();
  await page.getByTestId('map-front-create').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('map-front-draft')).toHaveCount(0);
  await page.getByTestId('btn-fronts-top').click();
  const front=page.getByTestId('fronts-modal').locator('button[data-testid^="front-pause-"]').first();
  const id=(await front.getAttribute('data-testid'))?.replace('front-pause-','');
  if(!id)throw Error('Front not created');
  await expect(page.getByTestId('front-'+id)).toBeVisible();
  await page.getByTestId('close-fronts').click();
  await page.getByTestId('map-front-target-mode').click();
  await expect(page.getByTestId('map-front-target-planner')).toBeVisible();
  await focusProvince(page,'KP-07');
  const bounds=await page.getByTestId('map').boundingBox();
  if(!bounds)throw Error('Map missing');
  await page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await expect(page.getByTestId('map-front-target-planner')).toHaveCount(0);
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('map-front-'+id).locator('.front-target')).toHaveCount(1);
  await page.getByTestId('btn-fronts-top').click();
  await expect(page.getByTestId('front-'+id)).toContainText('自動作戦');
  await page.getByTestId('close-fronts').click();
  expect(errors).toEqual([]);
});

test('戦線矩形ドラッグの視覚フィードバックとキャンセルは既存戦線を変更しない',async({page})=>{
  await startWar(page);
  await focusProvince(page,'KR-41');
  const marker=page.getByTestId('unit-marker-KR-41');
  const p=await marker.boundingBox();
  if(!p)throw Error('Marker unavailable');
  await page.getByTestId('map-front-draw').click();
  const x=p.x+p.width/2,y=p.y+p.height/2;
  await page.mouse.move(x-30,y-30);
  await page.mouse.down();
  await page.mouse.move(x+30,y+30,{steps:6});
  await expect(page.getByTestId('map-marquee-rectangle')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('map-front-draft-count')).not.toContainText('指定州: 0');
  await page.getByTestId('map-front-cancel').click();
  await expect(page.getByTestId('map-front-draft')).toHaveCount(0);
  await expect(page.getByTestId('map-front-target-mode')).toBeDisabled();
});
