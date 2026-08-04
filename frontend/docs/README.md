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
yarn test                 # Tous les tests
yarn test:watch           # Mode watch
yarn test --coverage      # Couverture
```

Depuis la racine : `yarn test:frontend` ou `yarn test` (backend + frontend + récap).
