#!/bin/bash
# Installe les dépendances au démarrage d'une session Claude Code dans le cloud,
# pour que lint, typecheck et tests soient utilisables immédiatement.
set -euo pipefail

# En local, les dépendances sont déjà gérées par le développeur.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
yarn install --frozen-lockfile --silent
yarn --cwd backend install --frozen-lockfile --silent
yarn --cwd frontend install --frozen-lockfile --silent
