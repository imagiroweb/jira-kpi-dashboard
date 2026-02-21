# Guide de déploiement – CI/CD et Portainer

Ce document détaille la configuration des **secrets GitHub** et l’intégration avec **Portainer** (webhook + stack).

---

## 1. Rappel du flux CI/CD

- **CI** : à chaque push/PR sur `main` ou `develop` → lint + build + validation Docker.
- **CD** : à chaque push sur `main` → build des images → push vers `ghcr.io`.
- **Déploiement** (optionnel) : après le push des images, soit **SSH** (commande sur le serveur), soit **Portainer** (webhook qui redéploie la stack).

---

## 2. Configurer les secrets et variables du dépôt

### Où les définir

1. Repo GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Onglet **Secrets and variables** → **Actions** (secrets = **Secrets**, chemins / méthode = **Variables**).

### Variables (Variables du dépôt)

| Nom | Valeur | Quand l’utiliser |
|-----|--------|------------------|
| `DEPLOY_METHOD` | `ssh` | Déploiement automatique via SSH après push sur `main`. |
| `DEPLOY_METHOD` | `portainer` | Déploiement automatique via webhook Portainer après push sur `main`. |
| *(rien ou autre)* | *(ne pas définir)* | Pas de déploiement auto, uniquement build + push des images. |
| `SSH_DEPLOY_PATH` | ex. `/opt/jira-kpi-dashboard` | Optionnel. Chemin du projet sur le serveur (défaut : `/opt/jira-kpi-dashboard`). Uniquement pour `DEPLOY_METHOD=ssh`. |

### Secrets – Déploiement SSH

À renseigner **uniquement si** `DEPLOY_METHOD = ssh` :

| Secret | Description | Exemple |
|--------|-------------|---------|
| `SSH_HOST` | IP ou hostname du serveur | `192.168.1.10` ou `mon-serveur.scaleway.com` |
| `SSH_USER` | Utilisateur SSH (souvent `root` ou `deploy`) | `root` |
| `SSH_PRIVATE_KEY` | Clé privée SSH (contenu complet de `id_rsa` ou équivalent) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `GHCR_TOKEN` | Token GitHub avec au moins `read:packages` (pour que le serveur tire les images depuis ghcr.io) | `ghp_...` ou Classic PAT |

Pour créer un **GHCR_TOKEN** :

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**.
2. Créer un token (Classic) avec la permission **read:packages**.
3. Coller la valeur dans le secret `GHCR_TOKEN`.

Sur le serveur, le script fait :

- `cd $SSH_DEPLOY_PATH` (ou `/opt/jira-kpi-dashboard` par défaut),
- `docker login ghcr.io` avec `GHCR_TOKEN`,
- `docker compose -f docker-compose.prod.yml -f docker-compose.prod.ghcr.yml pull && up -d`.

### Secrets – Déploiement Portainer (webhook)

À renseigner **uniquement si** `DEPLOY_METHOD = portainer` :

| Secret | Description |
|--------|-------------|
| `PORTAINER_WEBHOOK_URL` | URL du webhook fournie par Portainer pour la stack (voir section 3). |

---

## 3. Intégration Portainer (webhook + stack)

### 3.1 Créer la stack dans Portainer

1. Se connecter à Portainer → **Stacks** → **Add stack**.
2. **Name** : par ex. `jira-kpi-dashboard`.
3. **Build method** : **Web editor** (ou **Git repository** si vous préférez).

Contenu à coller (version minimale pour utiliser les images GHCR) :

```yaml
services:
  mongodb:
    image: mongo:7
    container_name: jira-kpi-mongodb
    restart: unless-stopped
    volumes:
      - mongo_data:/data/db
      - mongo_config:/data/configdb
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
      MONGO_INITDB_DATABASE: jira-kpi
    networks:
      - jira-kpi-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 40s

  redis:
    image: redis:7-alpine
    container_name: jira-kpi-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - jira-kpi-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

  backend:
    image: ghcr.io/imagiroweb/jira-kpi-backend:latest
    container_name: jira-kpi-backend
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - MONGODB_URI=mongodb://admin:${MONGO_PASSWORD}@mongodb:27017/jira-kpi?authSource=admin
      - REDIS_URL=redis://redis:6379
      - JIRA_URL=${JIRA_URL}
      - JIRA_EMAIL=${JIRA_EMAIL}
      - JIRA_API_TOKEN=${JIRA_API_TOKEN}
      - JIRA_PROJECT_KEY=${JIRA_PROJECT_KEY}
      - JIRA_BOARD_ID=${JIRA_BOARD_ID}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - CORS_ORIGIN=${CORS_ORIGIN:-http://localhost}
    volumes:
      - backend_uploads:/app/uploads
      - backend_logs:/app/logs
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - jira-kpi-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  frontend:
    image: ghcr.io/imagiroweb/jira-kpi-frontend:latest
    container_name: jira-kpi-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - jira-kpi-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/"]
      interval: 30s
      timeout: 10s
      retries: 5

networks:
  jira-kpi-network:
    driver: bridge

volumes:
  mongo_data:
  mongo_config:
  redis_data:
  backend_uploads:
  backend_logs:
```

4. Dans **Environment variables**, ajouter les variables nécessaires (elles seront utilisées par les services) :

- `MONGO_PASSWORD`
- `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_BOARD_ID`
- `CORS_ORIGIN` (ex. `https://ton-domaine.com`)
- Optionnel : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`

5. Si les images GHCR sont **privées** : dans Portainer, **Registries** → ajouter un registry **Custom** :
   - **Name** : `ghcr.io`
   - **URL** : `ghcr.io`
   - **Authentication** : activée, utilisateur = ton compte GitHub, mot de passe = token avec `read:packages`

6. Créer la stack (**Deploy the stack**).

### 3.2 Activer le webhook Portainer

1. Dans Portainer, ouvrir la stack **jira-kpi-dashboard**.
2. Onglet **Webhooks** (ou dans le détail de la stack, selon la version).
3. **Add webhook** → Portainer génère une URL du type :
   `https://portainer.example.com/api/webhooks/<uuid>`
4. Copier cette URL et la mettre dans le secret GitHub **`PORTAINER_WEBHOOK_URL`** (repo → Settings → Secrets and variables → Actions).
5. Mettre la variable du dépôt **`DEPLOY_METHOD`** = **`portainer`**.

À chaque push sur `main`, la CD pousse les images sur ghcr.io puis appelle cette URL ; Portainer **pull** et **redéploie** la stack automatiquement.

### 3.3 Alternative : stack depuis le repo Git

Si tu préfères que Portainer lise les fichiers du repo :

1. **Stacks** → **Add stack** → **Build method** : **Git repository**.
2. **Repository URL** : `https://github.com/imagiroweb/jira-kpi-dashboard`.
3. **Compose path** : pour utiliser les deux fichiers :
   - Portainer ne permet souvent qu’un seul fichier compose. Dans ce cas, mets uniquement le chemin vers un fichier qui inclut tout (par ex. `docker-compose.prod.yml` si tu y pointes déjà les images `ghcr.io`), ou duplique la stack complète dans un seul fichier (comme dans la section 3.1).
4. **Webhook** : même principe qu’en 3.2 ; après chaque push, déclencher le webhook pour que Portainer fasse **Pull and redeploy**.

---

## 4. Récapitulatif

| Objectif | Variables | Secrets |
|----------|-----------|---------|
| Pas de déploiement auto | Ne pas définir `DEPLOY_METHOD` | Aucun |
| Déploiement auto par SSH | `DEPLOY_METHOD` = `ssh`, optionnel `SSH_DEPLOY_PATH` | `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `GHCR_TOKEN` |
| Déploiement auto par Portainer | `DEPLOY_METHOD` = `portainer` | `PORTAINER_WEBHOOK_URL` |

Une fois ces réglages en place, un simple **push sur `main`** déclenche build, push des images et (si activé) déploiement soit en SSH soit via le webhook Portainer.
