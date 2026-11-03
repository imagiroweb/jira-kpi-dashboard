#!/usr/bin/env node
// Hook PreToolUse (outil Agent) : refuse le lancement d'un rôle du projet
// avec un autre modèle que celui de son fichier .claude/agents/<rôle>.md.
const { readAgent, readStdin } = require('./lib-agents.cjs');

const input = readStdin();
const toolInput = input.tool_input || {};
const role = toolInput.subagent_type;
const agent = readAgent(role);
if (!agent || !agent.model || agent.model === 'inherit') process.exit(0);

let reason = null;
if (toolInput.model && toolInput.model !== agent.model) {
  reason = `Le rôle « ${role} » doit tourner sur « ${agent.model} » (défini dans .claude/agents/${role}.md). ` +
    `Relance l'appel sans paramètre model, ou avec model: "${agent.model}".`;
} else if (
  process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE &&
  process.env.CLAUDE_CODE_SUBAGENT_MODEL &&
  process.env.CLAUDE_CODE_SUBAGENT_MODEL !== agent.model
) {
  reason = `CLAUDE_CODE_SUBAGENT_MODEL_FORCE impose « ${process.env.CLAUDE_CODE_SUBAGENT_MODEL} » à tous les sous-agents, ` +
    `alors que le rôle « ${role} » doit tourner sur « ${agent.model} ». Retire cette variable d'environnement.`;
}

if (reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}
