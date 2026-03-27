# 🚀 Jira KPI Dashboard avec Analyse IA

Un tableau de bord moderne et temps réel pour visualiser les KPI de vos projets Jira, enrichis par l'analyse IA.

![Dashboard Preview](https://via.placeholder.com/800x400?text=Jira+KPI+Dashboard)

## ✨ Fonctionnalités

### 📊 Métriques KPI
- **Vélocité** : Story points livrés par sprint
- **Taux de complétion** : Pourcentage d'issues terminées
- **Lead Time** : Temps moyen de la création à la résolution
- **Cycle Time** : Temps moyen du "In Progress" au "Done"
- **Bug Rate** : Ratio de bugs sur le total d'issues

### 🤖 Analyse IA
- Analyse automatique des tendances
- Détection des anomalies et alertes
- Recommandations d'actions concrètes
- Support Anthropic Claude et OpenAI GPT

### ⚡ Temps Réel
- WebSocket pour mises à jour instantanées
- Indicateur de connexion live
- Synchronisation automatique toutes les 15 min

### 📁 Import Excel
- Enrichissement des données Jira avec Excel
- Validation automatique des fichiers
- Mapping intelligent des colonnes

## 🛠️ Stack Technique

| Composant | Technologies |
|-----------|-------------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, Recharts |
| **Backend** | Node.js, Express, Socket.io, TypeScript |
| **Base de données** | MongoDB |
| **Cache** | Redis |
| **IA** | Anthropic Claude / OpenAI GPT |
| **Conteneurisation** | Docker, Docker Compose |

## 🚀 Démarrage Rapide

### Prérequis
- Node.js 18+
- Docker & Docker Compose
- Compte Jira Cloud avec token API
- Clé API Anthropic ou OpenAI

### 1. Cloner le projet
```bash
git clone <repository-url>
cd jira-kpi-dashboard
```

**Hooks Git (Husky)** : à la racine, exécuter `npm install` une fois pour installer Husky. Les commits déclencheront alors le lint backend + frontend automatiquement.

### 2. Configuration
Créez un fichier `.env` à la racine du projet :

```bash
# Jira Configuration
JIRA_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=PROJ
JIRA_BOARD_ID=1

# MongoDB
MONGO_PASSWORD=your-secure-password

# AI (choisir un)
ANTHROPIC_API_KEY=sk-ant-...
# ou
OPENAI_API_KEY=sk-...
```

### 3. Développement Local

#### Démarrer MongoDB et Redis
```bash
docker-compose -f docker-compose.dev.yml up -d
```

#### Backend
```bash
cd backend
npm install
npm run dev
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

L'application sera accessible sur :
- Frontend : http://localhost:3000
- Backend API : http://localhost:3001
- MongoDB Admin : http://localhost:8081

### 4. Production avec Docker
```bash
docker-compose up -d
```

L'application sera accessible sur http://localhost

## 🔄 CI/CD (GitHub Actions)

Le dépôt est configuré avec deux workflows :

| Workflow | Déclencheur | Actions |
|----------|-------------|---------|
| **CI** (`.github/workflows/ci.yml`) | Push / PR sur `main` ou `develop` | Lint + build backend & frontend, validation des Dockerfiles |
| **CD** (`.github/workflows/cd.yml`) | Push sur `main` (ou manuel) | Build des images Docker, push vers **GitHub Container Registry** (ghcr.io) |

### Schéma

```
Push/PR (main | develop)  →  CI : lint + build + docker build
         ↓
Push main                 →  CD : build images → push ghcr.io
         ↓
(optionnel) Déploiement    →  SSH sur le serveur → docker compose pull & up
```

### Images publiées

- `ghcr.io/imagiroweb/jira-kpi-backend:latest`
- `ghcr.io/imagiroweb/jira-kpi-frontend:latest`

### Déployer en prod (serveur avec Docker)

1. Sur le serveur, créer un `.env` (MONGO_PASSWORD, JIRA_*, etc.) et récupérer le projet (ou seulement les fichiers compose).
2. Rendre les images GHCR **publices** (Settings du repo → Packages → chaque package → Change visibility), **ou** sur le serveur se connecter à GHCR :
   ```bash
   echo $GITHUB_PAT | docker login ghcr.io -u VOTRE_USER --password-stdin
   ```
3. Lancer la stack avec les images GHCR :
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.prod.ghcr.yml up -d
   ```

### Déploiement automatique (optionnel)

Deux options, contrôlées par la **variable de dépôt** `DEPLOY_METHOD` (Settings → Secrets and variables → Actions → Variables) :

| Méthode | Variable `DEPLOY_METHOD` | Secrets à configurer |
|--------|---------------------------|----------------------|
| **SSH** | `ssh` | `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `GHCR_TOKEN` |
| **Portainer (webhook)** | `portainer` | `PORTAINER_WEBHOOK_URL` |

- **SSH** : le workflow se connecte au serveur, fait `docker login ghcr.io`, puis `docker compose pull` et `up -d` (chemin par défaut : `/opt/jira-kpi-dashboard`, modifiable via la variable `SSH_DEPLOY_PATH`).
- **Portainer** : le workflow appelle l’URL du webhook Portainer après le push des images ; Portainer fait alors un pull et redéploie la stack.

**Guide détaillé** (création des secrets, stack Portainer, webhook) : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## 📁 Structure du Projet

```
jira-kpi-dashboard/
├── .github/workflows/        # CI/CD (ci.yml, cd.yml)
├── .husky/                   # Hooks Git (pre-commit = lint backend + frontend)
├── docs/
│   └── DEPLOIEMENT.md        # Guide détaillé secrets + Portainer
├── frontend/                 # Application React
│   ├── src/
│   │   ├── components/      # Composants UI
│   │   ├── hooks/           # Custom hooks (WebSocket)
│   │   ├── services/        # API calls
│   │   ├── store/           # État global (Zustand)
│   │   └── types/           # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── backend/                  # API Node.js
│   ├── src/
│   │   ├── controllers/     # Logique métier
│   │   ├── models/          # Modèles MongoDB
│   │   ├── services/        # Services (Jira, IA, Excel)
│   │   ├── routes/          # Routes API
│   │   ├── websocket/       # Gestion WebSocket
│   │   └── utils/           # Helpers
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml        # Production
├── docker-compose.dev.yml   # Développement
├── package.json             # Racine (Husky + scripts lint unifiés)
└── README.md
```

## 🔌 API Endpoints

### Health
- `GET /api/health` - Status de l'application
- `GET /api/health/detailed` - Status détaillé avec dépendances

### Jira
- `GET /api/jira/test-connection` - Tester la connexion Jira
- `POST /api/jira/sync` - Synchroniser les données
- `GET /api/jira/issues` - Liste des issues
- `GET /api/jira/metrics` - Métriques calculées
- `GET /api/jira/velocity-trend` - Tendance vélocité
- `GET /api/jira/workload` - Charge de travail équipe

### KPI
- `GET /api/kpi/latest` - Dernier snapshot KPI
- `GET /api/kpi/history` - Historique des snapshots
- `POST /api/kpi/generate` - Générer un nouveau snapshot

### AI
- `POST /api/ai/analyze` - Analyse IA des KPI
- `POST /api/ai/analyze-sprint` - Analyse d'un sprint
- `POST /api/ai/analyze-team` - Analyse charge équipe

### Excel
- `POST /api/excel/upload` - Uploader un fichier Excel
- `GET /api/excel/files` - Liste des fichiers uploadés

## 🔧 Configuration Jira

### Obtenir un Token API
1. Connectez-vous à https://id.atlassian.com/manage-profile/security/api-tokens
2. Cliquez sur "Create API token"
3. Donnez un nom au token et copiez-le

### Trouver le Board ID
1. Ouvrez votre board Jira
2. L'URL contiendra `/boards/XXX` où XXX est le Board ID

### Champ Story Points
Par défaut, le champ story points est `customfield_10127` (variable `JIRA_STORY_POINTS_FIELD`). Pour trouver le vôtre :
1. Ouvrez une issue avec des story points
2. Utilisez l'API : `GET /rest/api/3/issue/{issueKey}?expand=names`
3. Cherchez le champ contenant vos story points

## 🎨 Personnalisation

### Thème
Le thème est configuré dans `frontend/tailwind.config.js`. Les couleurs principales :
- **Primary** : Bleu profond (#0c80f2)
- **Accent** : Cyan électrique (#06b6d4)
- **Success** : Émeraude (#10b981)
- **Warning** : Ambre (#f59e0b)
- **Danger** : Rose (#f43f5e)

### Prompts IA
Les prompts d'analyse sont configurés dans `backend/src/services/aiService.ts`. Vous pouvez les personnaliser pour :
- Adapter le ton et le style
- Ajouter des métriques spécifiques
- Changer la langue d'analyse

## 🐳 Docker Commands

```bash
# Démarrer en production
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down

# Rebuild après modifications
docker-compose build --no-cache
docker-compose up -d

# Développement avec volumes
docker-compose -f docker-compose.dev.yml up -d
```

## 📝 Variables d'Environnement

| Variable | Description | Requis |
|----------|-------------|--------|
| `JIRA_URL` | URL de votre instance Jira | ✅ |
| `JIRA_EMAIL` | Email du compte Jira | ✅ |
| `JIRA_API_TOKEN` | Token API Jira | ✅ |
| `JIRA_PROJECT_KEY` | Clé du projet (ex: PROJ) | ❌ |
| `JIRA_BOARD_ID` | ID du board Agile | ❌ |
| `MONGODB_URI` | URI de connexion MongoDB | ✅ |
| `JWT_SECRET` | Clé secrète pour JWT (32+ chars) | ✅ |
| `JWT_EXPIRES_IN` | Durée validité token (ex: 24h) | ❌ |
| `MICROSOFT_CLIENT_ID` | Client ID Azure App | ❌ |
| `MICROSOFT_TENANT_ID` | Tenant ID Azure (ou "common") | ❌ |
| `MICROSOFT_REDIRECT_URI` | URI de callback Microsoft | ❌ |
| `ANTHROPIC_API_KEY` | Clé API Anthropic | ⚠️ |
| `OPENAI_API_KEY` | Clé API OpenAI | ⚠️ |

⚠️ Au moins une clé API IA est requise pour l'analyse.

## 🔒 Sécurité & Authentification

### Fonctionnalités de sécurité
- **Authentification JWT** : Tokens sécurisés avec expiration configurable
- **Validation de mot de passe** : 12 caractères minimum, majuscules, minuscules, chiffres et caractères spéciaux requis
- **SSO Microsoft Entra ID** : Connexion via compte Microsoft entreprise
- Rate limiting sur les endpoints API
- Validation de tous les inputs utilisateur
- Headers de sécurité configurés (Helmet)
- Mots de passe hashés avec bcrypt (12 rounds)

### Configuration de l'authentification

Ajoutez ces variables à votre fichier `.env` :

```bash
# MongoDB Configuration (for authentication)
MONGODB_URI=mongodb://localhost:27017/jira-kpi

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=24h
```

### Configuration SSO Microsoft Entra ID

Pour activer la connexion Microsoft :

#### 1. Créer une App Registration dans Azure

1. Allez sur [Azure Portal](https://portal.azure.com)
2. Naviguez vers **Azure Active Directory** > **App registrations** > **New registration**
3. Configurez :
   - **Name** : Jira KPI Dashboard
   - **Supported account types** : Selon vos besoins
   - **Redirect URI** : `http://localhost:3000/auth/microsoft/callback` (type: SPA)

#### 2. Configurer les permissions API

Dans votre App Registration :
1. **API permissions** > **Add a permission** > **Microsoft Graph**
2. Ajoutez : `openid`, `profile`, `email`, `User.Read`

#### 3. Variables d'environnement

```bash
# Microsoft Entra ID SSO
MICROSOFT_CLIENT_ID=your-azure-app-client-id
MICROSOFT_TENANT_ID=your-tenant-id  # ou "common" pour multi-tenant
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback
```

### API Endpoints Authentification

- `POST /api/auth/register` - Inscription (email/password)
- `POST /api/auth/login` - Connexion (email/password)
- `POST /api/auth/validate-password` - Valider la force du mot de passe
- `POST /api/auth/microsoft/callback` - Callback SSO Microsoft
- `GET /api/auth/microsoft/config` - Configuration SSO Microsoft
- `GET /api/auth/me` - Infos utilisateur connecté
- `GET /api/auth/verify` - Vérifier validité du token

## 📦 Produit & Roadmap Adoria (Monday)

La page **Produit** affiche les KPI Monday (Suivi clients, Roadmap Adoria 2026). La logique métier de la roadmap (filtres trimestre, PM, statuts, kanban) est documentée et testée séparément :

- **[Documentation Roadmap Adoria / Produit](docs/produit-roadmap-adoria.md)**
- Tests : `cd frontend && yarn test src/domain/roadmapAdoriaKpi.test.ts`

## 📈 Roadmap

- [x] Authentification JWT
- [x] SSO Microsoft Entra ID
- [ ] Export PDF des rapports
- [ ] Comparaison multi-projets
- [ ] Notifications Slack/Teams
- [ ] Mode sombre
- [ ] Dashboards personnalisables

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 📄 Licence

MIT License - voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

Fait avec ❤️ et ☕ pour améliorer la gestion de projet Agile.

