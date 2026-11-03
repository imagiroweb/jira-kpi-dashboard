#!/usr/bin/env node
// Génère .cursor/agents/<rôle>.md à partir de .claude/agents/<rôle>.md, seule source des rôles.
// Cursor lit aussi .claude/agents/, mais ne comprend pas les alias de modèle de Claude Code
// (sonnet, opus, haiku) : la copie générée porte l'identifiant de modèle Cursor et prend le pas.
// Usage : node scripts/sync-cursor-agents.cjs [--check]
const fs = require('fs');
const path = require('path');

// Alias Claude Code → identifiant de modèle Cursor (https://cursor.com/docs/models).
const CURSOR_MODELS = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
};

const root = path.resolve(__dirname, '..');
const source = path.join(root, '.claude', 'agents');
const target = path.join(root, '.cursor', 'agents');
const check = process.argv.includes('--check');

function convert(content, file) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${file} : en-tête YAML introuvable`);
  const header = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) header[m[1]] = m[2].trim();
  }
  const model = CURSOR_MODELS[header.model] || header.model || 'inherit';
  const tools = (header.tools || '').split(',').map((t) => t.trim());
  const readonly = header.tools !== undefined && !tools.includes('Write') && !tools.includes('Edit');
  return [
    '---',
    `name: ${header.name || path.basename(file, '.md')}`,
    `description: ${JSON.stringify(header.description || '')}`,
    `model: ${model}`,
    `readonly: ${readonly}`,
    '---',
    '',
    `<!-- Fichier généré depuis .claude/agents/${path.basename(file)} par scripts/sync-cursor-agents.cjs : ne pas modifier à la main. -->`,
    '',
    match[2].trimStart(),
  ].join('\n');
}

const expected = new Map();
for (const file of fs.readdirSync(source).filter((f) => f.endsWith('.md')).sort()) {
  expected.set(file, convert(fs.readFileSync(path.join(source, file), 'utf8'), file));
}

if (check) {
  const stale = [];
  for (const [file, content] of expected) {
    const p = path.join(target, file);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) stale.push(file);
  }
  if (fs.existsSync(target)) {
    for (const file of fs.readdirSync(target)) if (!expected.has(file)) stale.push(file);
  }
  if (stale.length) {
    console.error(`.cursor/agents/ n'est pas à jour (${stale.join(', ')}). Lance : node scripts/sync-cursor-agents.cjs`);
    process.exit(1);
  }
  console.log('.cursor/agents/ est à jour.');
} else {
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(target)) if (!expected.has(file)) fs.unlinkSync(path.join(target, file));
  for (const [file, content] of expected) fs.writeFileSync(path.join(target, file), content);
  console.log(`${expected.size} rôles générés dans .cursor/agents/.`);
}
