import {test, expect} from '@playwright/test';

test('future dates render in both presentations and stop at the shared 2250 boundary', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__orrery?.diagnostics().ready)).toBe(true);
  const date = page.locator('#simulation-date');
  await expect(date).toHaveAttribute('max', '2249-12-31');
  for (const mode of ['Mechanical', 'Observatory']) {
    await page.getByRole('button', {name: mode, exact: true}).click();
    for (const value of ['2050-01-02', '2200-06-01', '2249-12-31']) {
      await date.fill(value);
      await date.blur();
      await expect.poll(() => page.evaluate(() => window.__orrery.getState().date)).toBe(`${value}T12:00:00.000Z`);
      await expect(page.locator('#body-distance')).not.toContainText(/NaN|Infinity/);
      await expect.poll(() => page.evaluate(() => window.__orrery.diagnostics().drawCalls)).toBeGreaterThan(0);
    }
  }
  await page.getByRole('button', {name: 'Mechanical', exact: true}).click();
  await page.locator('#manual-crank').focus();
  await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => window.__orrery.getState().date)).toBe('2250-01-01T00:00:00.000Z');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__orrery.getState().date)).toBe('2250-01-01T00:00:00.000Z');
  await page.keyboard.press('Home');
  await expect.poll(() => page.evaluate(() => window.__orrery.getState().date)).toBe('1800-01-01T00:00:00.000Z');
  await page.getByRole('button', {name: 'Science & sources', exact: true}).click();
  await expect(page.locator('#model-description')).toContainText('2250-01-01');
  expect(errors).toEqual([]);
});
