import {expect,test} from '@playwright/test';

test('下部ドックから連番軍団作成・師団編入・軍集団編入・名称変更ができる',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('army-command-dock')).toBeVisible();
  await expect(page.getByTestId('dock-create-army')).toBeEnabled();
  // Select one division in the detailed roster before creating the army.
  await page.getByTestId('roster-mode-list').click();
  const id=await page.locator('[data-unit-id]').first().getAttribute('data-unit-id');
  expect(id).toBeTruthy();
  await page.getByTestId('unit-roster-'+id).click();
  await page.getByTestId('dock-create-army').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-army-1')).toContainText('軍団1');
  await expect(page.getByTestId('dock-army-1')).toContainText('1/24');
  await page.getByTestId('dock-army-1').click();
  await page.getByTestId('dock-create-group').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-group-1')).toContainText('軍集団1');
  await expect(page.getByTestId('dock-group-1')).toContainText('1/5');
  await page.getByTestId('dock-rename-group-1').click();
  await page.getByTestId('dock-rename-input').fill('第1軍集団');
  await page.getByTestId('dock-rename-save').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-group-1')).toContainText('第1軍集団');
  await page.getByTestId('dock-rename-army-1').click();
  await page.getByTestId('dock-rename-input').fill('第1方面軍');
  await page.getByTestId('dock-rename-input').press('Enter');
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('dock-army-1')).toContainText('第1方面軍');
  await expect(page.getByTestId('dock-draw-front')).toBeVisible();
  await expect(page.getByTestId('dock-deploy-front')).toBeDisabled();
  await expect(page.getByTestId('dock-offensive-direction')).toBeDisabled();
});
