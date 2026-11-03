#!/usr/bin/env node
// Hook Cursor subagentStart : bloque un rôle du projet qui démarrerait sur un modèle hors de son niveau.
// Le niveau vient du `model:` de .claude/agents/<rôle>.md ; les modèles acceptés (modèle par défaut
// et équivalents) sont dans .claude/model-tiers.json. Chaque démarrage est noté dans .cursor/logs/usage.jsonl.
// Les tokens consommés ne sont visibles que dans https://cursor.com/dashboard/usage.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const { readAgent, readTiers, tierOf, tierAccepts, acceptedList } = require(path.join(root, '.claude', 'hooks', 'lib-agents.cjs'));

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const role = input.subagent_type || input.subagent_name || '';
const actual = input.subagent_model || '';
const agent = readAgent(role, path.join(root, '.claude', 'agents'));
let tiers = null;
try {
  tiers = readTiers(root);
} catch {
  tiers = null;
}
const tier = agent && tiers ? tierOf(agent.model, tiers) : null;
const verdict = tier ? tierAccepts(tier, actual, tiers) : { ok: true, equivalent: false };

try {
  const dir = path.join(root, '.cursor', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'usage.jsonl'), JSON.stringify({
    date: new Date().toISOString(),
    agent: role,
    niveau: tier ? tier.name : null,
    attendu: tier ? tier.cursor : null,
    modele: actual || null,
    equivalent: verdict.equivalent,
    respecte: verdict.ok,
  }) + '\n');
} catch {
  // Le journal est un bonus : on n'échoue jamais pour lui.
}

if (!verdict.ok) {
  process.stderr.write(`Le rôle « ${role} » est du niveau « ${tier.name} » et démarre sur « ${actual} »` +
    `${verdict.reason ? ` (${verdict.reason})` : ''}. Modèles acceptés : ${acceptedList(tier)}. ` +
    `Choisis l'un d'eux dans Cursor, ou attends que le modèle par défaut soit de nouveau disponible.\n`);
  process.exit(2);
}
if (verdict.equivalent) {
  process.stderr.write(`Rôle « ${role} » : équivalent « ${actual} » utilisé à la place de « ${tier.cursor} ». ` +
    `Note la bascule dans le compte rendu.\n`);
}
