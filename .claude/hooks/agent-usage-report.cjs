#!/usr/bin/env node
// Hook SubagentStop : calcule le modèle et les tokens consommés par le sous-agent
// à partir de son transcript, l'affiche à l'utilisateur et l'ajoute à .claude/logs/usage.jsonl.
const fs = require('fs');
const path = require('path');
const { projectDir, readAgent, modelMatches, readStdin } = require('./lib-agents.cjs');

const input = readStdin();
const role = input.agent_type || 'sous-agent';

let transcript = input.agent_transcript_path;
if (!transcript && input.transcript_path && input.agent_id) {
  transcript = path.join(input.transcript_path.replace(/\.jsonl$/, ''), 'subagents', `agent-${input.agent_id}.jsonl`);
}
if (!transcript || !fs.existsSync(transcript)) process.exit(0);

// Une réponse du modèle est écrite sur plusieurs lignes (une par bloc) : on garde, par requête,
// la ligne au plus grand nombre de tokens de sortie, qui porte le décompte final.
const byRequest = new Map();
const models = new Set();
for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
  if (!line) continue;
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  if (entry.type !== 'assistant' || !entry.message || !entry.message.usage) continue;
  if (entry.message.model) models.add(entry.message.model);
  const key = entry.requestId || entry.message.id || entry.uuid;
  const previous = byRequest.get(key);
  if (!previous || (entry.message.usage.output_tokens || 0) >= (previous.output_tokens || 0)) {
    byRequest.set(key, entry.message.usage);
  }
}
const total = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, requests: byRequest.size };
for (const u of byRequest.values()) {
  total.input += u.input_tokens || 0;
  total.cacheWrite += u.cache_creation_input_tokens || 0;
  total.cacheRead += u.cache_read_input_tokens || 0;
  total.output += u.output_tokens || 0;
}
if (total.requests === 0) process.exit(0);

const agent = readAgent(role);
const expected = agent && agent.model;
const modelList = [...models];
const respected = modelList.every((m) => modelMatches(expected, m));

const fmt = (n) => n.toLocaleString('fr-FR');
const inputTotal = total.input + total.cacheWrite + total.cacheRead;
let message = `Usage ${role} : ${modelList.join(', ') || 'modèle inconnu'}, ${total.requests} requêtes, ` +
  `${fmt(inputTotal)} tokens en entrée (dont ${fmt(total.cacheRead)} lus en cache), ${fmt(total.output)} en sortie.`;
if (expected && !respected) message += ` ⚠ Modèle attendu : ${expected}.`;

try {
  const dir = path.join(projectDir(), '.claude', 'logs');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'usage.jsonl'), JSON.stringify({
    date: new Date().toISOString(),
    agent: role,
    attendu: expected || null,
    modeles: modelList,
    respecte: respected,
    ...total,
  }) + '\n');
} catch {
  // Le journal est un bonus : on n'échoue jamais pour lui.
}

process.stdout.write(JSON.stringify({ systemMessage: message }));
