# Logs d’activité (Activity Logs)

Documentation des logs d’activité utilisateur : connexions, navigation, et évolutions prévues (erreurs 500).

## Modèle de données

**Collection MongoDB** : `useractivitylogs` (modèle `UserActivityLog`).

| Champ      | Type     | Description |
|-----------|----------|-------------|
| `userId`  | ObjectId | Référence vers `User` |
| `type`    | string   | `login` \| `page_view` \| `error_500` |
| `timestamp` | Date   | Date/heure de l’événement |
| `meta`    | Mixed    | Optionnel. Pour `page_view` : `{ page?, durationMs? }`. Pour `error_500` : `{ path?, count? }` |

Index : `(userId, timestamp)` pour les requêtes par utilisateur.

## Comportement métier

- **Connexion** : à chaque login réussi (email/mot de passe ou Microsoft SSO), un log `type: 'login'` est créé au plus **une fois par minute** par utilisateur (déduplication).
- **Navigation** : le front envoie une visite de page via `POST /api/auth/me/page-view`. Une même page par utilisateur est enregistrée au plus **une fois par minute** (déduplication).

## API (Swagger)

La doc Swagger est disponible sur `/api-docs` une fois le serveur démarré. Résumé des endpoints liés aux logs :

| Méthode | Route | Auth | Description |
|--------|--------|------|-------------|
| POST   | `/api/auth/me/page-view` | Bearer | Enregistre une visite de page (body `{ page }`). |
| GET    | `/api/auth/users/:id/logs` | Super admin | Liste des logs (connexions, page_view, etc.) avec `?limit=100`. |
| GET    | `/api/auth/users/:id/page-stats` | Super admin | Stats de navigation : compteur par page, total, pourcentages, compteur quotidien. `?days=30`. |

Détails des schémas et réponses : voir les blocs `@swagger` dans `src/routes/authRoutes.ts`.

## Tests

### Backend (Jest)

- **TU**
  - `src/domain/user/entities/UserActivityLog.test.ts` : modèle (schéma, types).
  - `src/application/services/AuthService.logs.test.ts` : création d’un log à la connexion et déduplication (1 log par minute).
- **TI**
  - `src/routes/authRoutes.activity.test.ts` : routes `POST /me/page-view`, `GET /users/:id/logs`, `GET /users/:id/page-stats` (middleware et `UserActivityLog` mockés).

Lancer les tests liés aux logs :

```bash
cd backend
yarn test --testPathPattern="UserActivityLog|AuthService.logs|authRoutes.activity"
```

### Frontend (Vitest)

- **TU** dans `src/services/authApi.test.ts` :
  - `recordPageView` : envoi POST, non bloquant en cas d’erreur.
  - `getUserLogs` : GET avec `limit`, gestion d’erreur.
  - `getUserPageStats` : GET avec `days`, structure de réponse (pages, total, percentages, daily).

```bash
cd frontend
yarn test authApi.test
```

## Évolutions prévues

- **Erreurs 500** : logs `type: 'error_500'` avec `meta: { path?, count? }` (côté front et/ou backend).
- **Temps passé par page** : utilisation de `meta.durationMs` pour les `page_view` (envoi au changement de page ou heartbeat).
