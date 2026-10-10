# Qualité et tests

Maintenu par l'agent QA (`.claude/agents/qa.md`).

## Niveaux de tests

| Niveau | Outil | Où | Quand |
|---|---|---|---|
| Unitaire | Jest / Vitest | `backend/src/**/*.test.ts`, `frontend/src/**/*.test.ts(x)` | Chaque PR (CI) |
| Routes API | Jest + supertest | `backend/src/routes/*.test.ts` | Chaque PR (CI) |
| E2E / non-régression | Playwright | `e2e/tests/` | Après chaque déploiement préprod, chaque nuit, à la demande |

## Non-régression préprod

Workflow `.github/workflows/e2e-preprod.yml`, cible `https://jira-kpi-preprod.imagiro.fr`. Secrets GitHub requis pour les parcours connectés : `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` (compte de test dédié à la préprod). Sans eux, seuls les tests publics tournent. Un échec ouvre une issue avec le label `non-regression`.

## Plans de tests

| Plan | Spec | Mise à jour |
|---|---|---|
| _(aucun pour l'instant)_ | | |

## Tests E2E

| Fichier | Parcours | Smoke |
|---|---|---|
| `e2e/tests/smoke.spec.ts` | API santé, affichage de l'écran de connexion | oui |
| `e2e/tests/auth.spec.ts` | Connexion avec le compte de test, refus d'un mauvais mot de passe | connexion |
