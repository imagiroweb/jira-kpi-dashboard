import { expect, test } from '@playwright/test';

// Parcours authentifié : nécessite un compte de test dédié à l'environnement ciblé.
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test.describe('connexion avec le compte de test', () => {
  test.skip(!email || !password, 'E2E_USER_EMAIL / E2E_USER_PASSWORD non définis');

  test('@smoke un utilisateur se connecte et quitte l\'écran de connexion', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('votre@email.com').fill(email!);
    await page.locator('input[type="password"]').first().fill(password!);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeHidden({ timeout: 15_000 });
  });

  test('un mauvais mot de passe est refusé', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('votre@email.com').fill(email!);
    await page.locator('input[type="password"]').first().fill('mauvais-mot-de-passe-e2e');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  });
});
