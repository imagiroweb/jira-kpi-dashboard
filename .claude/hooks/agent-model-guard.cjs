#!/usr/bin/env node
// Hook PreToolUse (outil Agent) : refuse le lancement d'un rôle du projet sur un modèle
// qui n'est pas de son niveau (.claude/model-tiers.json ; niveau déduit du `model:` de .claude/agents/<rôle>.md).
const { readAgent, readTiers, tierOf, tierAccepts, readStdin } = require('./lib-agents.cjs');

const input = readStdin();
const toolInput = input.tool_input || {};
const role = toolInput.subagent_type;
const agent = readAgent(role);
if (!agent || !agent.model || agent.model === 'inherit') process.exit(0);

let tiers = null;
try {
  tiers = readTiers();
} catch {
  tiers = null;
}
const tier = tiers ? tierOf(agent.model, tiers) : null;
// Sans fichier de niveaux, on retombe sur le modèle exact de l'en-tête.
const accepts = (model) => (tier ? tierAccepts(tier, model, tiers).ok : model === agent.model);
const label = tier ? `du niveau « ${tier.name} » (${tier.claude})` : `« ${agent.model} »`;

let reason = null;
if (toolInput.model && !accepts(toolInput.model)) {
  reason = `Le rôle « ${role} » doit tourner sur un modèle ${label}, défini dans .claude/agents/${role}.md. ` +
    `Relance l'appel sans paramètre model, ou avec model: "${agent.model}".`;
} else if (
  process.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE &&
  process.env.CLAUDE_CODE_SUBAGENT_MODEL &&
  !accepts(process.env.CLAUDE_CODE_SUBAGENT_MODEL)
) {
  reason = `CLAUDE_CODE_SUBAGENT_MODEL_FORCE impose « ${process.env.CLAUDE_CODE_SUBAGENT_MODEL} » à tous les sous-agents, ` +
    `alors que le rôle « ${role} » doit tourner sur un modèle ${label}. Retire cette variable d'environnement.`;
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
