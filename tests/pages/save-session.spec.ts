import { expect, test, type Page } from '@playwright/test';

async function start(page: Page) {
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-JPN').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('date')).toHaveText('2026-01-01');
}

test('セーブを再読み込みしても研究命令が重複せず、異常なインポートを拒否する', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await page.getByTestId('btn-research').click();
  await page.getByTestId('research-industry-basic').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('research-industry-basic')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-save').click();
  await page.getByTestId('save-slot-select').selectOption('slot2');
  await page.getByTestId('btn-do-save').click();
  await expect(page.getByTestId('slot-slot2')).toBeVisible();
  await expect(page.getByTestId('save-notice')).toBeVisible();
  await start(page);
  await page.getByTestId('btn-save').click();
  await page.getByTestId('load-slot2').click();
  await expect(page.getByTestId('save-modal')).toHaveCount(0);
  await expect(page.getByTestId('date')).toHaveText('2026-01-02');
  await page.getByTestId('btn-research').click();
  await expect(page.getByTestId('research-industry-basic')).toHaveCount(0);
  await page.getByTestId('research-medical-basic').click();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('research-medical-basic')).toHaveCount(0);
  await expect(page.getByTestId('date')).toHaveText('2026-01-03');
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-save').click();
  await page.getByTestId('save-import').setInputFiles({ name: 'invalid.orbis', mimeType: 'application/octet-stream', buffer: Buffer.from([0xc0]) });
  await expect(page.getByTestId('save-error')).toBeVisible();
  await expect(page.getByTestId('date')).toHaveText('2026-01-03');
  expect(errors).toEqual([]);
});

test('未実行命令がある場合は保存を抑止してから再開できる', async ({ page }) => {
  await start(page);
  await page.getByTestId('btn-research').click();
  await page.getByTestId('research-industry-basic').click();
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('btn-do-save')).toBeDisabled();
  await page.getByTestId('apply-pending').click();
  await expect(page.getByTestId('btn-do-save')).toBeEnabled();
  await page.getByTestId('btn-do-save').click();
  await expect(page.getByTestId('save-notice')).toBeVisible();
});
