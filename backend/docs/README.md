# Documentation backend

Index de la documentation technique du backend Jira KPI Dashboard.

## Guides

| Document | Description |
|----------|-------------|
| [Tests de routes API](./testing-routes.md) | Infrastructure Jest/supertest, mocks partagés, template et conventions pour `src/routes/*.test.ts` (couverture routes 69/69) |
| [Logs d’activité](./activity-logs.md) | Modèle `UserActivityLog`, endpoints auth, tests associés |

## Tests rapides

```bash
cd backend
yarn test              # Tous les tests
yarn test:routes       # Tests de routes uniquement
yarn test:coverage     # Rapport de couverture
```
