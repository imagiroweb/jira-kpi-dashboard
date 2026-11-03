#!/usr/bin/env node
// Hook Cursor subagentStart : bloque un rôle du projet qui démarrerait sur un autre modèle
// que celui de .cursor/agents/<rôle>.md, et note chaque démarrage dans .cursor/logs/usage.jsonl.
// Les tokens consommés ne sont visibles que dans https://cursor.com/dashboard/usage.
const fs = require('fs');
const path = require('path');

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }

const root = path.resolve(__dirname, '..', '..');
const role = input.subagent_type || input.subagent_name || '';
const actual = input.subagent_model || '';
let expected = null;
if (/^[a-z0-9-]+$/i.test(role)) {
  const file = path.join(root, '.cursor', 'agents', `${role}.md`);
  if (fs.existsSync(file)) {
    const m = fs.readFileSync(file, 'utf8').match(/^model:\s*(\S+)/m);
    if (m && m[1] !== 'inherit') expected = m[1];
  }
}
const respected = !expected || !actual || actual.startsWith(expected);

try {
  const dir = path.join(root, '.cursor', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'usage.jsonl'), JSON.stringify({
    date: new Date().toISOString(), agent: role, attendu: expected, modele: actual || null, respecte: respected,
  }) + '\n');
} catch {
  // Le journal est un bonus : on n'échoue jamais pour lui.
}

if (!respected) {
  process.stderr.write(`Le rôle « ${role} » doit tourner sur « ${expected} » mais démarre sur « ${actual} ». ` +
    `Vérifie que ce modèle est disponible dans ton offre Cursor (Max Mode, modèles autorisés par l'équipe).\n`);
  process.exit(2);
}
