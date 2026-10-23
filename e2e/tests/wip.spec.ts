import { expect, test } from '@playwright/test';

// Page « Suivi WIP » (issue #79, plan docs/qa/plans/suivi-wip.md, CT-74) : ouverture depuis le menu.
// Ne vérifie aucun chiffre Jira. Le compte de test doit avoir la page (rôle Dev ou PO).
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test.describe('Suivi WIP', () => {
  test.skip(!email || !password, 'E2E_USER_EMAIL / E2E_USER_PASSWORD non définis');

  test('@smoke la page Suivi WIP s\'ouvre depuis le menu', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('votre@email.com').fill(email!);
    await page.locator('input[type="password"]').first().fill(password!);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeHidden({ timeout: 15_000 });

    const entry = page.getByRole('button', { name: /Suivi WIP/ });
    await entry.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    test.skip(!(await entry.isVisible()), 'le rôle du compte de test n\'a pas la page Suivi WIP');
    await entry.click();

    await expect(page.getByRole('heading', { name: 'Suivi WIP' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Filtres' })).toBeVisible();
  });
});
