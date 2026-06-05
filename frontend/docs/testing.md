# Tests frontend (Vitest + Testing Library)

Guide pour écrire et maintenir les tests unitaires et composants React du frontend.

## Objectif

Couvrir la logique domaine, les services API et les composants sans dépendre du backend réel ni de socket.io / recharts en environnement jsdom. L’infrastructure partagée vit dans `src/test/` (miroir de `backend/src/test/`).

## Stack

| Outil | Rôle |
|-------|------|
| **Vitest** | Runner, mocks (`vi.mock`, `vi.hoisted`) |
| **jsdom** | Environnement DOM |
| **Testing Library** | Rendu et interactions composants |
| **`src/test/`** | Fixtures, mocks réutilisables, `renderWithProviders` |

## Commandes

Depuis la racine du monorepo, `npm run test` lance backend + frontend et affiche un tableau récapitulatif.

```bash
cd frontend

# Tous les tests
npm run test

# Mode watch
npm run test:watch

# Couverture
npx vitest run --coverage

# Fichier précis
npx vitest run src/services/authApi.test.ts
```

## Infrastructure partagée (`src/test/`)

```
src/test/
├── setup.ts              # jest-dom + mock global recharts
├── render.tsx            # renderWithProviders({ route, user, socket })
├── fixtures/
│   ├── users.ts          # TEST_USER, TEST_VISIBLE_PAGES_*
│   ├── jira.ts           # boards, epics, dashboard stats
│   ├── monday.ts         # colonnes, items Monday
│   └── supportKpi.ts     # payload support-kpi minimal
└── mocks/
    ├── api.ts            # createAxiosMocks(), axiosModuleMock()
    ├── authApi.ts        # createAuthApiMock() pour composants
    ├── store.ts          # resetStore(), seedAuthenticatedUser()
    ├── recharts.tsx      # stub ResponsiveContainer, BarChart, …
    └── socket.ts         # createMockSocketContextValue(), socketContextModuleMock()
```

## Template — test service (axios)

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axiosModuleMock } from '@/test/mocks/api';

const axiosMocks = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
  mockPut: vi.fn(),
}));
const { mockGet, mockPost } = axiosMocks;

vi.mock('axios', () => axiosModuleMock(axiosMocks));

import { authApi } from './authApi';

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retourne success et user en cas de succès', async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true, token: 'jwt', user: {} } });
    const result = await authApi.login('u@test.com', 'pass');
    expect(result.success).toBe(true);
  });
});
```

## Template — test composant avec providers

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { createAuthApiMock } from '@/test/mocks/authApi';
import { TEST_USER } from '@/test/fixtures/users';

vi.mock('@/services/authApi', () => ({ authApi: createAuthApiMock() }));

import { MonComposant } from './MonComposant';

describe('MonComposant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le contenu pour un utilisateur connecté', () => {
    renderWithProviders(<MonComposant />, { user: TEST_USER, socket: true });
    expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
  });
});
```

## Stratégie de mocks

| Couche | Approche |
|--------|----------|
| **axios** | `vi.hoisted(() => ({ mockGet: vi.fn(), … }))` + `axiosModuleMock(mocks)` |
| **authApi** | `createAuthApiMock()` — mock module entier dans les tests composants |
| **Zustand store** | `resetStore()` dans `beforeEach` ; `seedAuthenticatedUser()` si besoin |
| **localStorage** | Stub automatique via `resetStore()` / `stubLocalStorage()` |
| **recharts** | Mock global dans `setup.ts` — pas de configuration par test |
| **Socket** | `socket: true` dans `renderWithProviders` ou `socketContextModuleMock()` |

**Règle** : mocker au niveau le plus proche du code testé (service ou hook), pas toute l’arborescence.

## `renderWithProviders`

| Option | Défaut | Usage |
|--------|--------|-------|
| `route` | `'/'` | Route initiale `MemoryRouter` |
| `user` | — | `TEST_USER` connecté ; `null` = anonyme ; omis = état après `resetStore` |
| `socket` | `false` | `true` = `SocketContext` mocké ; objet = surcharge partielle |
| `resetStore` | `true` | Réinitialise Zustand + persist avant rendu |

Pattern recommandé :

```typescript
describe('MaPage', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('…', () => {
    renderWithProviders(<MaPage />, { user: TEST_USER });
  });
});
```

## Fixtures

| Fichier | Contenu |
|---------|---------|
| `fixtures/users.ts` | `TEST_USER_ID`, `TEST_USER`, `TEST_VISIBLE_PAGES_*` |
| `fixtures/jira.ts` | `TEST_JIRA_BOARDS`, `TEST_EPIC_PROGRESS_RESPONSE`, `TEST_BOARD_STATS` |
| `fixtures/monday.ts` | `TEST_MONDAY_COLUMNS`, `TEST_MONDAY_ITEMS` |
| `fixtures/supportKpi.ts` | `TEST_SUPPORT_KPI_PAYLOAD` |

## Conventions

- **Descriptions** : `it('retourne …')`, `it('affiche …')` — en français, comme les tests existants.
- **Isolation** : `beforeEach(() => { resetStore(); vi.clearAllMocks(); })`.
- **Hoisting** : déclarer les `vi.fn()` dans `vi.hoisted()` du fichier de test ; utiliser `axiosModuleMock(mocks)` pour le factory axios.
- **Pas de régression** : refactoriser vers les helpers ne doit pas changer le comportement testé.

## Anti-patterns

- **Oublier `resetStore()`** — fuites d’état Zustand / localStorage entre tests.
- **Importer le module sous test avant `vi.mock`** — les mocks doivent précéder l’import.
- **Tester recharts / layout SVG** — le mock global suffit ; assert sur le contenu métier.
- **Démarrer socket.io réel** — utiliser `socketContextModuleMock()` ou `renderWithProviders({ socket: true })`.
- **Dupliquer les fixtures utilisateur** — importer `TEST_USER` depuis `fixtures/users.ts`.

## Phase 1 — services & utilitaires (couverture ciblée)

Fichiers couverts en priorité (quick wins) :

| Fichier | Tests | Couverture lignes (indicatif) |
|---------|-------|-------------------------------|
| `src/services/api.test.ts` | jiraApi, epicApi, syncApi, snapshots, brevoApi, mondayApi | ~94 % (`api.ts`) |
| `src/services/mondayProduitCache.test.ts` | TTL mémoire, sessionStorage, invalidation, clés workspace | ~95 % |
| `src/utils/dateUtils.test.ts` | `formatDate`, `getDefaultDateRange` (fake timers) | 100 % |
| `src/constants/transactionalEvents.test.ts` | `getTransactionalEventBadgeClass` par type d’événement | 100 % |
| `src/store/useStore.test.ts` (étendu) | `updateUser`, `logout` (caches), `triggerKpiRefresh`, persist merge ISO | 100 % |

Les intercepteurs axios 401 de `api.ts` (redirect `/login`) ne sont pas testés ici — ils seront couverts en Phase 2+ si nécessaire via tests d’intégration composant.

## Liens

- Tests backend : [backend/docs/testing-routes.md](../../backend/docs/testing-routes.md)
- Couverture exclut `src/test/**` (voir `vitest.config.ts`)
