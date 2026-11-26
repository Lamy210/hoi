import {expect,test} from '@playwright/test';

test('下部軍団指揮バーから地点指定防衛を作成し停止・再開・解除できる',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-KOR').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('army-command-dock')).toBeVisible();
  await page.getByTestId('roster-mode-list').click();
  const id=await page.locator('[data-unit-id]').first().getAttribute('data-unit-id');
  expect(id).toBeTruthy();
  await page.getByTestId('unit-roster-'+id).click();
  await page.getByTestId('dock-garrison-toggle').click();
  const select=page.getByTestId('dock-garrison-province');
  const first=await select.locator('option').nth(1).getAttribute('value');
  expect(first).not.toBeNull();
  await select.selectOption(first!);
  await page.getByTestId('dock-garrison-add-province').click();
  await expect(page.getByTestId('dock-garrison-targets')).not.toContainText('地点未指定');
  await expect(page.getByTestId('dock-garrison-create')).toBeEnabled();
  await page.getByTestId('dock-garrison-create').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-garrison-order-1')).toContainText('自動防衛中');
  await expect(page.getByTestId('dock-garrison-order-1')).toContainText('1 師団');
  await page.getByTestId('dock-garrison-pause-1').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-garrison-order-1')).toContainText('停止中');
  await page.getByTestId('dock-garrison-pause-1').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-garrison-order-1')).toContainText('自動防衛中');
  await page.getByTestId('dock-garrison-delete-1').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-garrison-order-1')).toHaveCount(0);
});

test('登録済みの自国港だけを一括で駐屯対象に追加して作戦を作成する',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-KOR').click();
  await page.getByTestId('btn-start').click();
  await page.getByTestId('roster-mode-list').click();
  const id=await page.locator('[data-unit-id]').first().getAttribute('data-unit-id');
  expect(id).toBeTruthy();
  await page.getByTestId('unit-roster-'+id).click();
  await page.getByTestId('dock-garrison-toggle').click();
  await expect(page.getByTestId('dock-garrison-add-ports')).toBeEnabled();
  await expect(page.getByTestId('dock-garrison-add-ports')).toContainText('(2)');
  await page.getByTestId('dock-garrison-add-ports').click();
  await expect(page.getByTestId('dock-garrison-targets')).toContainText('釜山広域市');
  await expect(page.getByTestId('dock-garrison-targets')).toContainText('仁川広域市');
  await expect(page.getByTestId('dock-garrison-insufficient-units')).toContainText('全地点を同時に守れません');
  await expect(page.getByTestId('dock-garrison-add-ports')).toBeDisabled();
  await expect(page.getByTestId('dock-garrison-create')).toBeEnabled();
  await page.getByTestId('dock-garrison-create').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-garrison-order-1')).toContainText('釜山広域市');
  await expect(page.getByTestId('dock-garrison-order-1')).toContainText('仁川広域市');
  await expect(page.getByTestId('dock-garrison-order-1')).not.toContainText('東京都');
  const coverage=page.getByTestId('dock-garrison-coverage-1');
  await expect(coverage).toBeVisible();
  await expect(coverage).toContainText('防衛中');
  const targets=page.locator('[data-testid^="dock-garrison-target-1-"]');
  await expect(targets).toHaveCount(2);
  // With one assigned division and two ports at least one target must
  // remain uncovered until additional divisions are assigned.
  expect((await targets.allTextContents()).filter(s=>s.includes('未防衛')).length).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('dock-garrison-diagnose-1')).toBeEnabled();
  await page.getByTestId('dock-garrison-diagnose-1').click();
  const diagnosis=page.getByTestId('dock-garrison-diagnostics-1');
  await expect(diagnosis).toBeVisible();
  await expect(diagnosis).toContainText('陸路診断結果');
  await expect(diagnosis).toContainText('防衛優先 #1');
  await expect(diagnosis).toContainText('沿岸');
  await expect(page.locator('[data-testid^="dock-garrison-route-1-"]')).toHaveCount(2);
  // Diagnosis is read-only; it must not queue any game command.
  await expect(page.getByTestId('dock-garrison-order-1')).toContainText('自動防衛中');
});
