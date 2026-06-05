# Tests frontend (Vitest + Testing Library)

Guide pour écrire et maintenir les tests unitaires, hooks et composants React du frontend Jira KPI Dashboard.

## Vue d'ensemble

**Objectif** : couvrir progressivement la logique métier, les services API, les hooks temps réel et le shell d’authentification sans dépendre du backend réel, de MongoDB ni de socket.io en environnement jsdom.

**Stack** :

| Outil | Rôle |
|-------|------|
| **Vitest** | Runner, mocks (`vi.mock`, `vi.hoisted`) |
| **jsdom** | Environnement DOM |
| **Testing Library** | Rendu composants, `renderHook`, interactions |
| **`src/test/`** | Fixtures, mocks réutilisables, `renderWithProviders` |

**Commandes** :

```bash
# Depuis la racine du monorepo
npm run test              # Backend + frontend + tableau récap (couverture incluse)
npm run test:frontend     # Frontend uniquement

cd frontend
npm run test              # Tous les tests Vitest
npm run test:watch        # Mode watch
npx vitest run --coverage # Rapport de couverture détaillé
npx vitest run src/hooks/useSocket.test.ts  # Fichier précis
```

La couverture exclut `src/test/**` (voir `vitest.config.ts`).

---

## Phase 0 — Infrastructure partagée

Miroir de `backend/src/test/` : helpers centralisés pour éviter la duplication de mocks entre les phases.

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
    └── socket.ts         # createMockSocket(), socketIoModuleMock(), createMockSocketContextValue()
```

### `renderWithProviders`

| Option | Défaut | Usage |
|--------|--------|-------|
| `route` | `'/'` | Route initiale `MemoryRouter` |
| `user` | — | `TEST_USER` connecté ; `null` = anonyme ; omis = état après `resetStore` |
| `socket` | `false` | `true` = `SocketContext` mocké ; objet = surcharge partielle |
| `resetStore` | `true` | Réinitialise Zustand + persist avant rendu |

### Conventions (toutes phases)

- **Descriptions** : `it('retourne …')`, `it('affiche …')` — en **français**.
- **Isolation** : `beforeEach(() => { resetStore(); vi.clearAllMocks(); })`.
- **Hoisting** : déclarer les `vi.fn()` dans `vi.hoisted()` ; les mocks `vi.mock` doivent précéder l’import du module sous test.
- **Co-localisation** : `{Module}.test.ts(x)` à côté du fichier source.
- **Pas de régression** : refactoriser vers les helpers ne doit pas changer le comportement testé.

---

## Phase 1 — Services & utilitaires

Quick wins sur la logique pure et les appels API mockés (axios).

| Fichier source | Fichier test | Cas principaux | Couverture lignes |
|----------------|--------------|----------------|-------------------|
| `src/services/api.ts` | `api.test.ts` | jiraApi, epicApi, syncApi, snapshots, brevoApi, mondayApi | ~94 % |
| `src/services/authApi.ts` | `authApi.test.ts` | login, register, verifyToken, reset password | ~81 % |
| `src/services/mondayProduitCache.ts` | `mondayProduitCache.test.ts` | TTL mémoire, sessionStorage, invalidation | ~95 % |
| `src/utils/dateUtils.ts` | `dateUtils.test.ts` | `formatDate`, `getDefaultDateRange` (fake timers) | 100 % |
| `src/constants/transactionalEvents.ts` | `transactionalEvents.test.ts` | `getTransactionalEventBadgeClass` | 100 % |
| `src/store/useStore.ts` | `useStore.test.ts` | `updateUser`, `logout`, `triggerKpiRefresh`, persist | 100 % |
| `src/domain/epicProgress.ts` | `epicProgress.test.ts` | calculs progression épics | 100 % |
| `src/domain/roadmapAdoriaKpi.ts` | `roadmapAdoriaKpi.test.ts` | filtres roadmap Adoria | ~91 % |

**Pattern** : `vi.hoisted` + `axiosModuleMock(mocks)` pour les services HTTP.

**Couverture globale après Phase 1** : ~19,4 % lignes.

---

## Phase 2 — Auth shell & petits composants

Composants transverses et parcours d’authentification.

| Fichier source | Fichier test | Tests | Couverture lignes |
|----------------|--------------|-------|-------------------|
| `PasswordStrengthIndicator.tsx` | `PasswordStrengthIndicator.test.tsx` | 7 | 100 % |
| `LoginPage.tsx` | `LoginPage.test.tsx` | 5 | ~84 % |
| `Sidebar.tsx` | `Sidebar.test.tsx` | 5 | ~91 % |
| `RoleSelectionScreen.tsx` | `RoleSelectionScreen.test.tsx` | 3 | ~98 % |
| `ProjectSelector.tsx` | `ProjectSelector.test.tsx` | 4 | ~90 % |
| `NotificationToast.tsx` | `NotificationToast.test.tsx` | 8 | 100 % |
| `ForgotPasswordPage.tsx` | `ForgotPasswordPage.test.tsx` | — | — |
| `ResetPasswordPage.tsx` | `ResetPasswordPage.test.tsx` | 14 | ~98 % |
| `DateRangePicker.tsx` | `DateRangePicker.test.tsx` | 3 | — |

### Mocks Phase 2

| Composant | Mock |
|-----------|------|
| `LoginPage`, `RoleSelectionScreen` | `createAuthApiMock()` |
| `Sidebar` | `syncApi` + `useSocketContext` + `window.confirm` |
| `ProjectSelector` | `jiraApi.getProjects` |
| `PasswordStrengthIndicator`, `NotificationToast` | Aucun mock externe |

**Couverture globale après Phase 2** : ~26,8 % lignes (218 tests).

---

## Phase 3 — Hooks, socket & routage App

Couche temps réel et orchestration du shell applicatif.

| Fichier source | Fichier test | Cas testés | Couverture lignes |
|----------------|--------------|------------|-------------------|
| `hooks/useNotifications.ts` | `useNotifications.test.ts` | add/remove/update/clearAll ; helpers success/error/warning/info ; sync (update/complete/fail) ; `fromAlert` ; `fromSyncProgress` | ~100 % |
| `hooks/useSocket.ts` | `useSocket.test.ts` | pas de connexion si non auth ; connexion + `subscribe:kpi` ; déconnexion ; `clients:count` / `pong` ; handlers `alert:new` / `sync:progress` ; emit subscribe/sync/ping ; cleanup unmount | ~87 % |
| `hooks/useSocketContext.ts` | `useSocketContext.test.tsx` | erreur hors provider ; `useSocketOptional` → null ; contexte via mock | 100 % |
| `contexts/SocketContext.tsx` | `SocketContext.test.tsx` | rendu enfants ; alerte → toast ; sync → `dashboardLoading` ; `notify.success` | ~92 % |
| `App.tsx` | `App.test.tsx` | `/auth/microsoft/callback` ; `/reset-password?token=` ; loader verify ; redirect LoginPage ; logout si token invalide ; `pendingRoleSelection` → RoleSelectionScreen ; app authentifiée | ~94 % |

### Mocks Phase 3

| Module | Approche |
|--------|----------|
| `socket.io-client` | `vi.hoisted` + mock inline (`on`/`emit`/`trigger`) — voir `useSocket.test.ts` |
| `SocketContext` (tests App) | `SocketProvider` stubé (pas de socket réel) |
| Dashboards lourds (tests App) | `vi.mock('./components/SprintDashboard')`, etc. |
| `MicrosoftCallback` (tests App) | stub léger pour isoler le routage |
| `authApi` (tests App) | `createAuthApiMock()` — `verifyToken`, `getCurrentUser` |
| `window.location` | `vi.stubGlobal('location', { pathname, search, … })` |

### Extension `src/test/mocks/socket.ts`

- `createMockSocket()` — socket factice avec `trigger(event, …args)` pour simuler les événements socket.io.
- `socketIoModuleMock(mockIo)` — factory pour `vi.mock('socket.io-client')`.
- `createMockSocketContextValue()` / `socketContextModuleMock()` — inchangés (Phase 0/2).

**Couverture globale après Phase 3** : ~30,1 % lignes (246 tests, +28).

---

## Phase 4 — EpicProgress & graphiques ✅

Couverture des pages épics, graphiques worklog et détail utilisateurs.

| Fichier source | Fichier test | Tests | Couverture lignes |
|----------------|--------------|-------|-------------------|
| `EpicProgressPage.tsx` | `EpicProgressPage.test.tsx` | 9 (+7) | ~82 % |
| `ResolvedByDayChart.tsx` | `ResolvedByDayChart.test.tsx` | 4 | ~87 % |
| `UserTicketsChart.tsx` | `UserTicketsChart.test.tsx` | 2 | ~91 % |
| `UserWorkloadChart.tsx` | `UserWorkloadChart.test.tsx` | 2 | ~62 % |
| `UserDetailPage.tsx` | `UserDetailPage.test.tsx` | 2 | ~83 % |

### Cas testés Phase 4

| Composant | Scénarios |
|-----------|-----------|
| `EpicProgressPage` | chargement + tri ; recherche + modale détail ; filtres type / statut / préfixe ; pagination ; cache `filtersKey` ; modale story points ; erreur API détail |
| `ResolvedByDayChart` | rendu null sans boards ; données mockées (fetch) ; état vide ; erreur API |
| `UserTicketsChart` | skeleton chargement utilisateurs ; sélection user + tickets (fetch `/worklog/search`) |
| `UserWorkloadChart` | skeleton chargement ; rendu utilisateurs depuis `sharedReportPayload` |
| `UserDetailPage` | chargement rapport worklog ; affichage graphiques après fetch `/worklog/report` |

### Mocks Phase 4

| Module | Approche |
|--------|----------|
| `epicApi` / `jiraApi` | `vi.mock('../services/api')` — `getProgress`, `search`, `getDetails`, `getConfiguredBoards` |
| Cache épics | `useStore.setState` — `epicsLastFiltersKey` + `epicsProgressPayload` pré-remplis |
| Charts fetch | `vi.stubGlobal('fetch', mockFetch)` — `/jira/resolved-by-day`, `/worklog/report`, `/worklog/search`, `/worklog/saved-reports` |
| `UserDetailPage` | stubs `ProjectSelector` + `DateRangePicker` ; projets seedés dans le store |
| recharts | mock global `setup.ts` (inchangé Phase 0) |

Fixtures : `TEST_EPIC_PROGRESS_ITEM`, `TEST_EPIC_DETAILS_RESPONSE` depuis `src/test/fixtures/jira.ts`.

**Couverture globale après Phase 4** : ~39,7 % lignes (263 tests, +17).

---

## Phase 5 — Dashboards & smoke tests ✅

Extraction de la logique testable des gros dashboards + smoke tests par page.

### Part A — Extraction domaine / utilitaires

| Fichier source | Fichier extrait | Tests | Couverture lignes |
|----------------|-----------------|-------|-------------------|
| `ProduitDashboard.tsx` (`computeSuiviKpis`, helpers) | `domain/produitSuiviKpi.ts` | `produitSuiviKpi.test.ts` (8) | ~93 % |
| `SupportDashboard.tsx` (`formatHours`) | `utils/timeFormat.ts` | `timeFormat.test.ts` (3) | 100 % |

Fonctions extraites vers `produitSuiviKpi.ts` : `computeSuiviKpis`, `mondayMacroEstimateDiffPct`, `isDefinedCaisseLabel`, `parseDate`, `parseNum`, `isRoadmapAdoria2026Workspace`, `getItemColumnLabelText` + constantes colonnes Suivi Monday.

### Part B — Smoke tests dashboards

| Fichier source | Fichier test | Tests | Couverture lignes |
|----------------|--------------|-------|-------------------|
| `SprintDashboard.tsx` | `SprintDashboard.test.tsx` | 4 | ~69 % |
| `SupportDashboard.tsx` | `SupportDashboard.test.tsx` | 4 | ~63 % |
| `MarketingDashboard.tsx` | `MarketingDashboard.test.tsx` | 3 | ~60 % |
| `ProduitDashboard.tsx` | `ProduitDashboard.test.tsx` | 4 | ~46 % |
| `UserManagementPage.tsx` | `UserManagementPage.test.tsx` | 3 | ~30 % |

### Cas testés Phase 5

| Composant | Scénarios |
|-----------|-----------|
| `SprintDashboard` | chargement → KPI SP ; toggle sprint actif / période ; sauvegarde snapshot mockée ; cache `filtersKey` |
| `SupportDashboard` | skeleton chargement ; KPI ratio support/build ; cache `filtersKey` ; toggle sprint actif |
| `MarketingDashboard` | Brevo non configuré ; campagnes récentes/manuelles ; auth Brevo invalide (401) |
| `ProduitDashboard` | bootstrap Monday mock ; section Roadmap visible ; refresh ; board suivi par défaut |
| `UserManagementPage` | gating super_admin ; liste utilisateurs ; accès via `visiblePages.gestionUtilisateurs` |

### Mocks Phase 5

| Module | Approche |
|--------|----------|
| `fetch` (Sprint, Support) | `vi.stubGlobal('fetch', …)` — `/jira/configured-boards`, `/jira/dashboard/sprint-issues-all`, `/worklog/support-kpi` |
| `mondayApi` (Produit) | `vi.mock('../services/api')` — `getStatus`, `getMe`, `getWorkspaces`, `getBoards`, `getBoard` |
| `brevoApi` (Marketing) | mock `getStatus`, `getStats`, `getTransactionalEvents` |
| `authApi` (UserManagement) | `createAuthApiMock()` — `getUsersAndRoles` |
| `dashboardSnapshotApi` / `supportSnapshotApi` | mock module `api` |
| `DateRangePicker` | stub bouton « Changer dates » (Sprint, Support, Marketing) |
| `ResolvedByDayChart` | stub null (Sprint) |
| Cache store | `useStore.setState` — `supportLastFiltersKey`, `dashboardLastFiltersKey` + payloads |
| recharts | mock global — `ResponsiveContainer` sans enfants (évite warnings SVG `linearGradient`) |

Fixtures : `TEST_SUPPORT_KPI_PAYLOAD`, `TEST_MONDAY_*`, `TEST_USER` / rôle `super_admin`.

**Couverture globale après Phase 5** : ~69,6 % lignes (292 tests, +29).

---

## Phase 6 — Couverture avancée ✅

Dernière phase optionnelle : SSO Microsoft, modales snapshots/détails, navigation App, sections Produit.

| Fichier source | Fichier test | Tests | Couverture lignes |
|----------------|--------------|-------|-------------------|
| `MicrosoftCallback.tsx` | `MicrosoftCallback.test.tsx` | 8 | ~99 % |
| `SprintDashboard.tsx` | `SprintDashboard.test.tsx` | 7 (+3) | ~88 % |
| `SupportDashboard.tsx` | `SupportDashboard.test.tsx` | 8 (+4) | ~85 % |
| `ProduitDashboard.tsx` | `ProduitDashboard.test.tsx` | 6 (+2) | ~46 % |
| `App.tsx` | `App.test.tsx` | 8 (+1) | ~96 % |

### Cas testés Phase 6

| Composant | Scénarios |
|-----------|-----------|
| `MicrosoftCallback` | loader ; erreur hash/query Azure ; token absent ; succès + login store + redirect `/` ; erreur backend ; exception réseau ; bouton retour connexion |
| `SprintDashboard` | modale historique (liste + état vide) ; chargement snapshot depuis historique (`getSnapshot`) |
| `SupportDashboard` | modale historique snapshots ; sauvegarde snapshot ; modale détail résolution ; modale première prise en charge |
| `ProduitDashboard` | repli/dépli section Suivi clients ; repli section Roadmap |
| `App` | navigation sidebar dashboard → support → produit → dashboard ; `recordPageView` |

### Non couvert (hors périmètre)

| Élément | Raison |
|---------|--------|
| Intercepteurs axios 401 (`api.ts` L22-41) | mock axios sans chaîne interceptors — faible ROI |
| E2E Playwright | hors Vitest |
| `main.tsx` | exclu volontairement |
| Word cloud Produit (pixels SVG) | smoke métier uniquement |

`ForgotPasswordPage` (~98 %) et `ResetPasswordPage` (~98 %) : déjà couverts en Phase 2 — non retouchés.

**Couverture globale après Phase 6** : ~74,6 % lignes (310 tests frontend, +18 ; 705 tests monorepo).

**Plan frontend terminé** — objectif ~70–75 %+ atteint.

---

## Tableau de couverture par phase

| Phase | Périmètre | Tests cumulés | Couverture lignes (cible / atteinte) |
|-------|-----------|---------------|--------------------------------------|
| 0 | Infra `src/test/` | — | 0 % (setup) |
| 1 | Services, utils, store, domain | ~186 | ~19,4 % |
| 2 | Auth shell, petits composants | 218 | ~26,8 % |
| 3 | Hooks socket, App routing | 246 | ~30,1 % |
| 4 | EpicProgress, charts, UserDetail | 263 | ~39,7 % |
| 5 | Dashboards smoke + domaine Suivi | 292 | ~69,6 % |
| 6 | SSO, modales avancées, navigation App | 310 | ~74,6 % |

---

## Tableau fichiers testés / restants

### Testés ✅

| Fichier source | Fichier test |
|----------------|--------------|
| `App.tsx` | `App.test.tsx` |
| `services/api.ts` | `services/api.test.ts` |
| `services/authApi.ts` | `services/authApi.test.ts` |
| `services/mondayProduitCache.ts` | `services/mondayProduitCache.test.ts` |
| `utils/dateUtils.ts` | `utils/dateUtils.test.ts` |
| `constants/transactionalEvents.ts` | `constants/transactionalEvents.test.ts` |
| `store/useStore.ts` | `store/useStore.test.ts` |
| `domain/epicProgress.ts` | `domain/epicProgress.test.ts` |
| `domain/roadmapAdoriaKpi.ts` | `domain/roadmapAdoriaKpi.test.ts` |
| `hooks/useNotifications.ts` | `hooks/useNotifications.test.ts` |
| `hooks/useSocket.ts` | `hooks/useSocket.test.ts` |
| `hooks/useSocketContext.ts` | `hooks/useSocketContext.test.tsx` |
| `contexts/SocketContext.tsx` | `contexts/SocketContext.test.tsx` |
| `components/LoginPage.tsx` | `components/LoginPage.test.tsx` |
| `components/ForgotPasswordPage.tsx` | `components/ForgotPasswordPage.test.tsx` |
| `components/ResetPasswordPage.tsx` | `components/ResetPasswordPage.test.tsx` |
| `components/RoleSelectionScreen.tsx` | `components/RoleSelectionScreen.test.tsx` |
| `components/Sidebar.tsx` | `components/Sidebar.test.tsx` |
| `components/ProjectSelector.tsx` | `components/ProjectSelector.test.tsx` |
| `components/PasswordStrengthIndicator.tsx` | `components/PasswordStrengthIndicator.test.tsx` |
| `components/NotificationToast.tsx` | `components/NotificationToast.test.tsx` |
| `components/DateRangePicker.tsx` | `components/DateRangePicker.test.tsx` |
| `components/EpicProgressPage.tsx` | `components/EpicProgressPage.test.tsx` |
| `components/ResolvedByDayChart.tsx` | `components/ResolvedByDayChart.test.tsx` |
| `components/UserTicketsChart.tsx` | `components/UserTicketsChart.test.tsx` |
| `components/UserWorkloadChart.tsx` | `components/UserWorkloadChart.test.tsx` |
| `components/UserDetailPage.tsx` | `components/UserDetailPage.test.tsx` |
| `domain/produitSuiviKpi.ts` | `domain/produitSuiviKpi.test.ts` |
| `utils/timeFormat.ts` | `utils/timeFormat.test.ts` |
| `components/SprintDashboard.tsx` | `components/SprintDashboard.test.tsx` |
| `components/SupportDashboard.tsx` | `components/SupportDashboard.test.tsx` |
| `components/MarketingDashboard.tsx` | `components/MarketingDashboard.test.tsx` |
| `components/ProduitDashboard.tsx` | `components/ProduitDashboard.test.tsx` |
| `components/UserManagementPage.tsx` | `components/UserManagementPage.test.tsx` |
| `components/MicrosoftCallback.tsx` | `components/MicrosoftCallback.test.tsx` |

### Restants ⏳

| Fichier source | Phase prévue | Priorité |
|----------------|--------------|----------|
| `components/index.ts` | — | Ignoré (barrel) |
| `types/index.ts` | — | Ignoré (types) |
| `main.tsx` | — | Exclu (bootstrap) |

---

## Templates

### Test service (axios)

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

### Test composant avec providers

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

### Test hook socket (socket.io mock)

```typescript
const socketHarness = vi.hoisted(() => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const mockSocket = {
    connected: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(handler);
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    trigger(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
    clearHandlers() { for (const k of Object.keys(handlers)) delete handlers[k]; },
  };
  return { mockSocket, mockIo: vi.fn(() => mockSocket) };
});

vi.mock('socket.io-client', () => ({
  io: socketHarness.mockIo,
  default: { io: socketHarness.mockIo },
}));
```

---

## Stratégie de mocks

| Couche | Approche |
|--------|----------|
| **axios** | `vi.hoisted` + `axiosModuleMock(mocks)` |
| **authApi** | `createAuthApiMock()` — mock module entier |
| **Zustand store** | `resetStore()` ; `seedAuthenticatedUser()` |
| **localStorage** | Stub via `resetStore()` / `stubLocalStorage()` |
| **recharts** | Mock global `setup.ts` |
| **socket.io-client** | Mock inline hoisted avec `trigger()` |
| **SocketContext** | `renderWithProviders({ socket: true })` ou mock module |

**Règle** : mocker au niveau le plus proche du code testé, pas toute l’arborescence.

---

## Anti-patterns

- **Oublier `resetStore()`** — fuites Zustand / localStorage entre tests.
- **Importer le module sous test avant `vi.mock`** — ordre incorrect.
- **Tester recharts / layout SVG** — assert sur le contenu métier uniquement.
- **Démarrer socket.io réel** — toujours mocker `socket.io-client`.
- **Dupliquer les fixtures** — importer depuis `src/test/fixtures/`.
- **Importer `createMockSocket` dans `vi.hoisted`** — préférer le mock inline hoisted (cf. Phase 3).

---

## Liens

- Index docs frontend : [README.md](./README.md)
- Tests backend : [backend/docs/testing-routes.md](../../backend/docs/testing-routes.md)
- Suivi épics (UI) : [docs/SUIVI_EPICS.md](../../docs/SUIVI_EPICS.md)
