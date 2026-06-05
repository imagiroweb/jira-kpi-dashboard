# Tests de routes API (backend)

Guide pour écrire et maintenir les tests d’intégration (TI) et unitaires de routes Express du backend.

## Objectif

Couvrir les routes HTTP (`src/routes/`) de bout en bout via **supertest**, sans démarrer le serveur ni toucher à MongoDB / APIs externes réelles. Les dépendances (auth, services, clients, modèles) sont mockées de façon reproductible grâce à l’infrastructure partagée dans `src/test/`.

## Stack

| Outil | Rôle |
|-------|------|
| **Jest** | Runner de tests, mocks (`jest.mock`) |
| **ts-jest** | Transpilation TypeScript |
| **supertest** | Requêtes HTTP sur une app Express isolée |
| **`src/test/`** | Factory Express, mocks réutilisables, fixtures |

## Commandes

Depuis la racine du monorepo, `npm run test` lance backend + frontend et affiche un tableau récapitulatif en fin d'exécution.

```bash
cd backend

# Tous les tests
yarn test

# Uniquement les tests de routes
yarn test:routes

# Couverture globale
yarn test:coverage

# Fichier ou motif précis
yarn test mondayRoutes.test
yarn test --testPathPattern="authRoutes.activity"
```

## Infrastructure partagée (`src/test/`)

```
src/test/
├── createTestApp.ts          # Factory Express (json, mount, io optionnel)
├── fixtures/
│   ├── users.ts              # TEST_USER_ID, TEST_USER
│   ├── worklogs.ts           # TEST_WORKLOG_PAYLOAD
│   └── jira.ts               # projets, boards, epics, snapshots dashboard
└── mocks/
    ├── authMiddleware.ts       # bypassAuth, mockAuthenticate, mockRequireSuperAdmin, mockAuthDenied
    ├── mongoose.ts           # mockMongoConnected, mockMongoDisconnected
    ├── logger.ts             # mockLogger, loggerMockFactory
    ├── worklogAppService.ts  # createWorklogAppServiceMock
    └── externalClients.ts    # createMondayClientMock, createBrevoClientMock
```

## Template — nouveau fichier `*.routes.test.ts`

```typescript
/**
 * TI — Routes XXX : description courte des endpoints couverts
 */
import request from 'supertest';
import { createTestApp } from '../test/createTestApp';
import { TEST_USER_ID } from '../test/fixtures/users';

// Mocks globaux (hoistés par Jest — utiliser jest.requireActual pour les helpers partagés)
jest.mock('mongoose', () =>
  jest.requireActual('../test/mocks/mongoose').mockMongoConnected()
);

jest.mock('../middleware/authMiddleware', () => {
  const auth = jest.requireActual<typeof import('../test/mocks/authMiddleware')>('../test/mocks/authMiddleware');
  return {
    authenticate: auth.mockAuthenticate(),
    requireSuperAdmin: auth.mockRequireSuperAdmin,
  };
});

jest.mock('../utils/logger', () =>
  jest.requireActual('../test/mocks/logger').loggerMockFactory()
);

// Mock du service / client métier propre à cette route
const mockMonService = { maMethode: jest.fn() };
jest.mock('../chemin/VersService', () => ({ monService: mockMonService }));

import { xxxRoutes } from './xxxRoutes';

describe('xxxRoutes (TI)', () => {
  const app = createTestApp({ mountPath: '/api/xxx', router: xxxRoutes });

  beforeEach(() => {
    jest.clearAllMocks();
    // Valeurs par défaut des mocks
  });

  describe('GET /api/xxx/endpoint', () => {
    it('retourne 200 avec les données attendues', async () => {
      mockMonService.maMethode.mockResolvedValue({ ok: true });
      const res = await request(app).get('/api/xxx/endpoint');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
```

## Stratégie de mocks

| Couche | Approche |
|--------|----------|
| **Express app** | `createTestApp({ mountPath, router, json?, io? })` |
| **Auth** | `bypassAuth` (routes publiques), `mockAuthenticate(user?)` (user injecté), `mockAuthDenied` (401) |
| **Super admin** | `mockRequireSuperAdmin` + mock `User.findById` → `{ role: 'super_admin' }` |
| **MongoDB** | `mockMongoConnected()` dans `jest.mock('mongoose', …)` — pas de vraie connexion |
| **Logger** | `loggerMockFactory()` — évite le bruit console |
| **Services applicatifs** | Objet `jest.fn()` mocké module par module (`AuthService`, `worklogAppService`, …) |
| **Clients externes** | `createMondayClientMock()`, `createBrevoClientMock()` + mock du getter (`getMondayClient`, etc.) |
| **Rate limiting** | Mock `express-rate-limit` → middleware no-op (voir `authRoutes.password-reset.test.ts`) |

**Règle** : mocker au niveau le plus proche de la route (service ou client), pas les repositories internes sauf si la route appelle directement un modèle Mongoose (`UserActivityLog`, etc.).

## Modes d’authentification

| Mode | Helper | Usage |
|------|--------|-------|
| Sans auth | `bypassAuth` | Routes Monday (authenticate présent mais bypass), routes publiques |
| Utilisateur connecté | `mockAuthenticate()` ou `mockAuthenticate({ userId, email, provider })` | Routes `/api/auth/me/*`, Jira, worklog |
| Refus 401 | `mockAuthDenied` | Tester qu’une route protégée rejette sans token |
| Super admin | `mockRequireSuperAdmin` + `User.findById` mocké | Routes admin (`/users/:id/logs`, etc.) |

Fixtures : `TEST_USER_ID` et `TEST_USER` dans `src/test/fixtures/users.ts`.

## Conventions

- **Nommage** : `{routeFile}.test.ts` ou `{routeFile}.{scope}.test.ts` (ex. `authRoutes.activity.test.ts`).
- **Commentaires** : en français, comme les tests existants (`TU` = tests unitaires de route, `TI` = tests d’intégration HTTP).
- **Descriptions** : `it('retourne 400 si …')` — statut HTTP + comportement métier.
- **Structure** : un `describe` par endpoint, cas nominal puis erreurs (400, 401, 403, 500).
- **Isolation** : `beforeEach(() => jest.clearAllMocks())` + réinitialisation des `mockResolvedValue` par défaut.
- **Pas de régression** : refactoriser vers les helpers ne doit pas changer le comportement testé.

## Table de couverture (routes)

| Fichier route | Fichier test | Statut |
|---------------|--------------|--------|
| `authRoutes.ts` | `authRoutes.core.test.ts`, `authRoutes.admin.test.ts`, `authRoutes.microsoft.test.ts`, `authRoutes.activity.test.ts`, `authRoutes.password-reset.test.ts` | Couvert (19/19) |
| `mondayRoutes.ts` | `mondayRoutes.test.ts` | Couvert |
| `jiraRoutes.ts` | `jiraRoutes.core.test.ts`, `jiraRoutes.snapshots.test.ts` | Couvert (15/15) |
| `worklogRoutes.ts` | `worklogRoutes.core.test.ts`, `worklogRoutes.snapshots.test.ts` | Couvert (20/20) |
| `healthRoutes.ts` | `healthRoutes.test.ts` | Couvert (4/4) |
| `brevoRoutes.ts` | `brevoRoutes.test.ts` | Couvert (5/5) |

**Total routes couvertes : 69/69 (100 %)**

Voir aussi les tests domaine / services (hors routes) : `AuthService.*.test.ts`, `WorklogApplicationService.*.test.ts`, etc.

## Anti-patterns

- **Démarrer `index.ts` ou écouter un port** — utiliser `createTestApp` + supertest.
- **Base MongoDB réelle ou Docker** — toujours mocker mongoose / modèles.
- **Dupliquer `createApp()` et les mocks auth/logger** — importer depuis `src/test/`.
- **Importer le router avant les `jest.mock`** — les mocks doivent précéder l’import du module sous test.
- **Assertions vagues** (`expect(res.status).toBeTruthy()`) — préférer le code exact et la forme du body.
- **Tests qui dépendent de l’ordre d’exécution** — chaque test doit être autonome via `beforeEach`.
- **Sur-mocker** — ne mocker que ce que la route utilise ; éviter de mocker toute l’arborescence DDD.

## Liens

- [Logs d’activité (activity-logs.md)](./activity-logs.md) — endpoints auth liés aux logs et leurs tests.
- Tests frontend : `cd frontend && yarn test`
