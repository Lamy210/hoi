import {test,expect} from '@playwright/test';

test('選択した複数師団の一括装備交換に必要な条件と操作を表示する',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map-zoom-in')).toBeEnabled({timeout:30000});
  const batch=page.getByTestId('exchange-model-batch-submit');
  await expect(batch).toBeVisible();
  await expect(batch).toBeDisabled();
  const list=page.getByTestId('order-of-battle').locator('[data-testid^="oob-unit-"]');
  await expect(list.first()).toBeVisible();
  await list.first().click();
  await expect(page.getByTestId('quick-selected-count')).toContainText('1');
  await expect(batch).toBeDisabled();
  await list.nth(1).click({modifiers:['Control']});
  await expect(page.getByTestId('quick-selected-count')).toContainText('2');
  await expect(batch).toBeDisabled(); // no identified national stock in starting scenario
  await expect(page.getByTestId('army-model-exchange')).toContainText('選択師団を一括交換');
  await expect(page.getByTestId('exchange-model-target').locator('option')).toHaveCount(1);
  await page.getByTestId('exchange-model-quantity').fill('250');
  await expect(batch).toBeDisabled();
  await list.first().click();
  await expect(page.getByTestId('quick-selected-count')).toContainText('1');
  await expect(page.getByTestId('exchange-model-submit')).toBeDisabled();
});
