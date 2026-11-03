# Instructions pour les agents de code

Ce dépôt partage ses instructions entre Claude Code et Cursor :

- Contexte, commandes et conventions : [CLAUDE.md](CLAUDE.md)
- Rôles (analyste métier, documentaliste, qa, securite, reviewer) : [.claude/agents/](.claude/agents/), exposés dans Cursor en sous-agents par [.cursor/agents/](.cursor/agents/) (générés par `node scripts/sync-cursor-agents.cjs`) et en règles par [.cursor/rules/](.cursor/rules/)

Modifier ces fichiers sources plutôt que de dupliquer les règles ailleurs.
