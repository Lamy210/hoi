import {test,expect} from '@playwright/test';

async function startJapan(page:import('@playwright/test').Page){
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
}

test('マウスの矩形選択から師団をまとめて停止し、Ctrlクリックで選択を解除できる',async({page})=>{
  await startJapan(page);
  const tokyo=page.getByTestId('unit-marker-JP-13');
  const osaka=page.getByTestId('unit-marker-JP-27');
  await expect(tokyo).toBeVisible();
  await expect(osaka).toBeVisible();
  const a=await tokyo.boundingBox(),b=await osaka.boundingBox();
  const mapBox=await page.getByTestId('map').boundingBox();
  if(!a||!b||!mapBox)throw Error('map marker geometry unavailable');
  const left=Math.max(mapBox.x+2,Math.min(a.x+a.width/2,b.x+b.width/2)-12);
  const top=Math.max(mapBox.y+2,Math.min(a.y+a.height/2,b.y+b.height/2)-12);
  const right=Math.min(mapBox.x+mapBox.width-2,Math.max(a.x+a.width/2,b.x+b.width/2)+12);
  const bottom=Math.min(mapBox.y+mapBox.height-2,Math.max(a.y+a.height/2,b.y+b.height/2)+12);
  await page.getByTestId('map-box-select').click();
  await expect(page.getByTestId('map-marquee-hint')).toBeVisible();
  await page.mouse.move(left,top);
  await page.mouse.down();
  await page.mouse.move(right,bottom,{steps:8});
  await expect(page.getByTestId('map-marquee-rectangle')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('map-marquee-rectangle')).toHaveCount(0);
  await expect(tokyo).toHaveAttribute('aria-pressed','true');
  await expect(osaka).toHaveAttribute('aria-pressed','true');
  const count=Number((await page.getByTestId('quick-selected-count').innerText()).match(/\d+/)?.[0]);
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('quick-halt-selected')).toBeEnabled();
  await page.getByTestId('quick-halt-selected').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('resume-selected-automation')).toBeEnabled();
  await page.getByTestId('map-box-select').click();
  await tokyo.click({modifiers:['Control']});
  await expect(tokyo).toHaveAttribute('aria-pressed','false');
  await tokyo.click({modifiers:['Control']});
  await expect(tokyo).toHaveAttribute('aria-pressed','true');
});

test('師団一覧でShift範囲選択・Ctrlトグルが一括指揮に反映される',async({page})=>{
  await startJapan(page);
  await page.getByTestId('roster-mode-list').click();
  const rows=page.getByTestId('unit-roster').locator('button[data-unit-id]');
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await rows.nth(0).click();
  await rows.nth(2).click({modifiers:['Shift']});
  await expect(page.getByTestId('quick-selected-count')).toContainText('3');
  await rows.nth(1).click({modifiers:['Control']});
  await expect(page.getByTestId('quick-selected-count')).toContainText('2');
  await expect(rows.nth(1)).toHaveAttribute('aria-pressed','false');
  await expect(page.getByTestId('quick-halt-selected')).toBeEnabled();
});
