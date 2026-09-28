#!/usr/bin/env bash
# Sauvegarde chiffrée de la base jira-kpi : mongodump (archive gzip) chiffré à la volée avec
# OpenSSL (AES-256, clé dérivée PBKDF2) — aucune copie en clair n'est écrite sur le disque.
#
# À lancer depuis le dossier de déploiement (celui du .env), par exemple chaque nuit via cron :
#   cd /opt/jira-kpi-dashboard && bash scripts/mongo-backup-encrypted.sh
#   bash scripts/mongo-backup-encrypted.sh jira-kpi-preprod-mongodb      # préprod
#
# Variables (environnement ou ./.env) :
#   MONGO_PASSWORD         mot de passe root (déjà présent)
#   BACKUP_PASSPHRASE      phrase de chiffrement des sauvegardes (openssl rand -hex 32), conservée
#                          dans le coffre, DIFFÉRENTE de DATA_ENCRYPTION_KEY
#   BACKUP_DIR             dossier de destination (défaut : ./backups)
#   BACKUP_RETENTION_DAYS  durée de conservation des sauvegardes (défaut : 30)
#
# Restauration (sur un serveur disposant du même DATA_ENCRYPTION_KEY, sans quoi les champs
# chiffrés resteront illisibles) :
#   sha256sum -c <fichier>.enc.sha256
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in <fichier>.enc \
#     | docker exec -i -e ROOT_PASS <conteneur> sh -c 'cfg=$(mktemp); printf "password: \"%s\"\n" "$ROOT_PASS" > "$cfg"; \
#         mongorestore --config="$cfg" -u admin --authenticationDatabase admin --archive --gzip --drop; rm -f "$cfg"'
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
BACKUP_PASSPHRASE="$(read_env BACKUP_PASSPHRASE)"
BACKUP_DIR="$(read_env BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="$(read_env BACKUP_RETENTION_DAYS)"; RETENTION="${RETENTION:-30}"

[ -n "$ROOT_PASS" ] || { echo "MONGO_PASSWORD introuvable (environnement ou .env)"; exit 1; }
[ -n "$BACKUP_PASSPHRASE" ] || { echo "BACKUP_PASSPHRASE introuvable : ajoutez-le au .env (openssl rand -hex 32)"; exit 1; }
[ "${#BACKUP_PASSPHRASE}" -ge 24 ] || { echo "BACKUP_PASSPHRASE trop court (24 caractères minimum)"; exit 1; }
[ "$BACKUP_PASSPHRASE" != "$(read_env DATA_ENCRYPTION_KEY)" ] || { echo "BACKUP_PASSPHRASE doit différer de DATA_ENCRYPTION_KEY"; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/jira-kpi-$STAMP.archive.gz.enc"
TMP="$OUT.part"
trap 'rm -f "$TMP"' EXIT

# Le mot de passe root passe par un fichier de configuration éphémère dans le conteneur
# (jamais dans la ligne de commande, visible par `ps`).
ROOT_PASS="$ROOT_PASS" docker exec -i -e ROOT_PASS "$CONTAINER" sh -c '
  umask 077; cfg=$(mktemp); printf "password: \"%s\"\n" "$ROOT_PASS" > "$cfg"
  mongodump --quiet --config="$cfg" -u admin --authenticationDatabase admin --db jira-kpi --archive --gzip
  status=$?; rm -f "$cfg"; exit $status' \
  | BACKUP_PASSPHRASE="$BACKUP_PASSPHRASE" openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass env:BACKUP_PASSPHRASE -out "$TMP"

mv "$TMP" "$OUT"
trap - EXIT
sha256sum "$OUT" > "$OUT.sha256"
echo "Sauvegarde chiffrée : $OUT ($(du -h "$OUT" | cut -f1))"

# Rotation : suppression des sauvegardes plus anciennes que la durée de conservation.
find "$BACKUP_DIR" -maxdepth 1 -name 'jira-kpi-*.archive.gz.enc*' -type f -mtime +"$RETENTION" -print -delete
