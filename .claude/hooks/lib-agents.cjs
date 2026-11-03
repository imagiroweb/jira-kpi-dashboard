// Fonctions partagées par les hooks de .claude/hooks/ et par les scripts de synchro.
const fs = require('fs');
const path = require('path');

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// Lit l'en-tête YAML simple (clé: valeur) d'un rôle de .claude/agents/.
function readAgent(name, dir = path.join(projectDir(), '.claude', 'agents')) {
  if (!name || !/^[a-z0-9-]+$/i.test(name)) return null;
  const file = path.join(dir, `${name}.md`);
  if (!fs.existsSync(file)) return null;
  const match = fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const header = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) header[m[1]] = m[2].trim();
  }
  return header;
}

function readTiers(root = projectDir()) {
  const file = path.join(root, '.claude', 'model-tiers.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Niveau dont le modèle Claude Code (alias ou identifiant Cursor) est `model`, ou null.
function tierOf(model, tiers) {
  if (!model) return null;
  for (const [name, tier] of Object.entries(tiers.niveaux)) {
    if (model === tier.claude || model === tier.cursor) return { name, ...tier };
  }
  return null;
}

// Sépare « gemini-4-argon[effort=high] » en identifiant et options.
function parseModel(value) {
  const m = String(value).trim().match(/^([^[\s]+)(?:\[(.*)\])?$/);
  if (!m) return { id: String(value), options: {} };
  const options = {};
  for (const pair of (m[2] || '').split(',')) {
    const [k, v] = pair.split('=').map((s) => s && s.trim());
    if (k) options[k] = v;
  }
  return { id: m[1], options };
}

// Vrai si `actual` (identifiant renvoyé par l'outil) est le modèle par défaut du niveau
// (ou une autre version Claude de la même famille) ou un équivalent accepté. Les variantes « -fast » (prix doublé) ne sont pas acceptées.
// Un effort indiqué doit être au moins celui demandé ; un effort absent n'est pas vérifiable.
function tierAccepts(tier, actual, tiers) {
  if (!tier || !actual) return { ok: true, equivalent: false };
  const { id, options } = parseModel(actual);
  const sameModel = (expected) =>
    id === expected || (id.startsWith(`${expected}-`) && !/-fast$/.test(id));
  // Toute version Claude de la même famille (claude-opus-5-5, claude-opus-6…) reste au niveau.
  if (id === tier.claude || sameModel(tier.cursor) || sameModel(`claude-${tier.claude}`)) {
    return { ok: true, equivalent: false };
  }
  const order = tiers.effortOrdre || [];
  for (const eq of tier.equivalents || []) {
    if (!sameModel(eq.id)) continue;
    if (eq.effortMin && options.effort && order.indexOf(options.effort) < order.indexOf(eq.effortMin)) {
      return { ok: false, equivalent: true, reason: `effort ${options.effort} inférieur au minimum ${eq.effortMin}` };
    }
    return { ok: true, equivalent: true };
  }
  return { ok: false, equivalent: false };
}

// Liste lisible des modèles acceptés pour un niveau.
function acceptedList(tier) {
  return [tier.cursor, ...(tier.equivalents || []).map((e) => (e.effortMin ? `${e.id} (effort ≥ ${e.effortMin})` : e.id))].join(', ');
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

module.exports = { projectDir, readAgent, readTiers, tierOf, parseModel, tierAccepts, acceptedList, readStdin };
