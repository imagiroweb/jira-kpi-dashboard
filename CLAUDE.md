# Jira KPI Dashboard

Tableau de bord KPI Jira (sprints, worklogs, épics, support, performance des équipes, point hebdo) enrichi par l'IA. Monorepo yarn 1 : `backend/` (Node 20, Express, Socket.io, MongoDB, Redis, TypeScript) et `frontend/` (React 18, Vite, TailwindCSS, Recharts, Zustand).

## Commandes

Depuis la racine :

```bash
yarn install:all          # installe racine + backend + frontend
yarn lint                 # ESLint backend + frontend
yarn --cwd frontend typecheck
yarn test                 # Jest (backend) + Vitest (frontend) + récapitulatif
yarn test:backend         # ou: yarn --cwd backend test:routes
yarn test:frontend
yarn --cwd e2e test      # E2E Playwright (E2E_BASE_URL, défaut http://localhost:3000)
yarn dev                  # backend + frontend en parallèle
```

Le hook husky `pre-commit` lance lint, typecheck et tests : ils doivent passer avant chaque commit. La CI (`.github/workflows/ci.yml`) refait lint, tests, build et build Docker sur chaque PR vers `main` ou `develop`.

## Architecture backend (DDD)

- `src/domain/` : entités, value objects et règles métier pures (pas d'I/O). Chaque fichier a son `.test.ts` voisin.
- `src/application/` : services applicatifs, use cases, DTO.
- `src/infrastructure/` : clients externes (Jira, Monday, Brevo, email), cache, conteneur d'injection (`Container.ts`).
- `src/routes/` : routes Express, toutes testées avec supertest (voir `backend/docs/testing-routes.md`).

Frontend : la logique de calcul vit dans `frontend/src/domain/`, les composants dans `src/components/`, l'état global dans `src/store/useStore.ts`, les appels API dans `src/services/`.

## Conventions

- Code, commentaires et documentation en français.
- Toute nouvelle logique métier va dans `domain/` avec ses tests ; toute nouvelle route a son test de route.
- Ne jamais committer de secrets (`.env`, `env.prod.template` sont ignorés).
- Une branche par tâche (`claude/<sujet>` pour Claude), PR vers `develop` (déployée en préprod sur `jira-kpi-preprod.imagiro.fr`), puis `develop` → `main` pour la prod. Revue humaine obligatoire avant tout merge.

## Workflow agentique

La chaîne de travail est **Documentation → Analyse → Plan de tests → Dev → Review → Non-régression** :

1. **documentaliste** (`.claude/agents/documentaliste.md`) maintient la documentation fonctionnelle dans `docs/` à partir du code.
2. **analyste-metier** (`.claude/agents/analyste-metier.md`) cadre un besoin avec l'utilisateur en lisant **uniquement** `docs/`, puis rédige une spec (user stories + critères d'acceptation) dans une issue GitHub.
3. **qa** (`.claude/agents/qa.md`) écrit le plan de tests et les cas d'usage de la spec dans `docs/qa/plans/`.
4. La session principale (Dev) implémente la spec validée avec les tests du plan et ouvre une PR.
5. **reviewer** (`.claude/agents/reviewer.md`) relit la PR contre la spec et le plan de tests avant la revue humaine.
6. Après le déploiement en préprod (push sur `develop`), `.github/workflows/e2e-preprod.yml` lance la non-régression Playwright (`e2e/`). En cas d'échec, une issue `non-regression` est ouverte et l'agent **qa** l'analyse.

Après chaque changement fonctionnel, mettre à jour la page concernée de `docs/` dans la même PR (ou déléguer au documentaliste).

### Avec Cursor

Cursor charge ce fichier via `.cursor/rules/projet.mdc`. Les rôles s'appellent dans le chat avec `@analyste-metier`, `@documentaliste`, `@qa` et `@reviewer` ; le modèle conseillé est indiqué dans chaque règle. Les fichiers `.claude/agents/*.md` restent la source unique des rôles.
