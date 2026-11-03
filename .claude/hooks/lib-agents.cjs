// Lecture des rôles définis dans .claude/agents/*.md (en-tête YAML simple).
const fs = require('fs');
const path = require('path');

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// Renvoie { model, tools } pour un rôle du projet, ou null si le rôle n'est pas défini ici.
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

// Le modèle réellement servi (ex. claude-sonnet-5-5) correspond-il au modèle attendu (alias ou identifiant) ?
function modelMatches(expected, actual) {
  if (!expected || expected === 'inherit' || !actual) return true;
  if (expected.startsWith('claude-')) return actual.startsWith(expected);
  return actual.includes(expected);
}

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

module.exports = { projectDir, readAgent, modelMatches, readStdin };
