import { expect, test } from '@playwright/test';

// Non-régression minimale : l'application répond et l'écran de connexion s'affiche.

test('@smoke API santé répond ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).status).toBe('ok');
});

test("@smoke l'écran de connexion s'affiche", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Jira KPI Dashboard' })).toBeVisible();
  await expect(page.getByPlaceholder('votre@email.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
});
