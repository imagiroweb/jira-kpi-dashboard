#!/usr/bin/env bash
# Crée (ou met à jour) l'utilisateur MongoDB applicatif à droits limités : readWrite sur la
# base jira-kpi uniquement. Le backend s'y connecte à la place du compte root « admin ».
#
# À lancer UNE FOIS par serveur (prod, préprod), depuis le dossier de déploiement qui contient
# le .env, AVANT de déployer une version qui utilise MONGO_APP_USER / MONGO_APP_PASSWORD :
#
#   cd /opt/jira-kpi-dashboard            # (ou le dossier préprod)
#   bash scripts/mongo-create-app-user.sh              # conteneur jira-kpi-mongodb
#   bash scripts/mongo-create-app-user.sh jira-kpi-preprod-mongodb
#
# Variables lues dans l'environnement ou, à défaut, dans ./.env :
#   MONGO_PASSWORD      mot de passe root (déjà présent)
#   MONGO_APP_USER      nom de l'utilisateur applicatif (défaut : jira_kpi_app)
#   MONGO_APP_PASSWORD  mot de passe applicatif — générer avec : openssl rand -hex 32
#                       (hexadécimal : aucun caractère à encoder dans l'URI MongoDB)
# Idempotent : relancer le script met à jour le mot de passe et les droits.
set -euo pipefail

CONTAINER="${1:-jira-kpi-mongodb}"

read_env() {
  local name="$1"
  if [ -n "${!name:-}" ]; then printf '%s' "${!name}"; return; fi
  if [ -f .env ]; then
    grep -E "^${name}=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
  fi
}

ROOT_PASS="$(read_env MONGO_PASSWORD)"
APP_USER="$(read_env MONGO_APP_USER)"; APP_USER="${APP_USER:-jira_kpi_app}"
APP_PASS="$(read_env MONGO_APP_PASSWORD)"

[ -n "$ROOT_PASS" ] || { echo "MONGO_PASSWORD introuvable (environnement ou .env)"; exit 1; }
[ -n "$APP_PASS" ] || { echo "MONGO_APP_PASSWORD introuvable : ajoutez-le au .env (openssl rand -hex 32)"; exit 1; }
[ "${#APP_PASS}" -ge 24 ] || { echo "MONGO_APP_PASSWORD trop court (24 caractères minimum)"; exit 1; }
[ "$APP_PASS" != "$ROOT_PASS" ] || { echo "MONGO_APP_PASSWORD doit être différent du mot de passe root"; exit 1; }

# Les secrets passent par l'environnement du processus (jamais dans la ligne de commande).
ROOT_PASS="$ROOT_PASS" APP_USER="$APP_USER" APP_PASS="$APP_PASS" \
docker exec -i -e ROOT_PASS -e APP_USER -e APP_PASS "$CONTAINER" mongosh --quiet --norc <<'JS'
const admin = db.getSiblingDB('admin');
admin.auth('admin', process.env.ROOT_PASS);
const app = db.getSiblingDB('jira-kpi');
const roles = [{ role: 'readWrite', db: 'jira-kpi' }];
if (app.getUser(process.env.APP_USER)) {
  app.updateUser(process.env.APP_USER, { pwd: process.env.APP_PASS, roles });
  print(`Utilisateur ${process.env.APP_USER} mis à jour (readWrite sur jira-kpi).`);
} else {
  app.createUser({ user: process.env.APP_USER, pwd: process.env.APP_PASS, roles });
  print(`Utilisateur ${process.env.APP_USER} créé (readWrite sur jira-kpi).`);
}
JS

echo "OK. Vérifiez que le .env contient MONGO_APP_USER=${APP_USER} et MONGO_APP_PASSWORD, puis redéployez."
