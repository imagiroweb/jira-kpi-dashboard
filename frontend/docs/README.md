# Documentation frontend

Index de la documentation technique du frontend Jira KPI Dashboard.

## Guides

| Document | Description |
|----------|-------------|
| [Tests frontend (Vitest)](./testing.md) | Infrastructure `src/test/`, plan de couverture par phases (0–6), templates et tableau fichiers testés / restants |
| [Suivi épics (UI)](../../docs/SUIVI_EPICS.md) | Page EpicProgress, modale SP, filtres |

## Tests rapides

```bash
cd frontend
npm run test              # Tous les tests
npm run test:watch        # Mode watch
npx vitest run --coverage # Couverture
```

Depuis la racine : `npm run test:frontend` ou `npm run test` (backend + frontend + récap).
