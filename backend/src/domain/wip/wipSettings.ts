/**
 * Réglages de la page « Suivi WIP » (spec issue #79) : statuts de départ et d'arrivée, et seuil par
 * équipe = nombre de devs × tickets max par dev (3 par défaut). Validation pure des saisies.
 */
import { DEFAULT_WIP_END_STATUSES, DEFAULT_WIP_START_STATUSES, NO_TEAM } from './wipWeekly';

export const DEFAULT_MAX_TICKETS_PER_DEV = 3;
export const MAX_DEV_COUNT = 50;
export const MAX_TICKETS_PER_DEV = 20;
const MAX_STATUSES = 20;

export interface WipTeamSetting {
  /** Nom de l'équipe tel que dans le champ équipe Jira. */
  team: string;
  /** 0 : seuil non défini. */
  devCount: number;
  /** Tickets max par dev propre à l'équipe ; null : valeur par défaut. */
  maxPerDev: number | null;
}

export interface WipSettingsValue {
  startStatuses: string[];
  endStatuses: string[];
  defaultMaxPerDev: number;
  teams: WipTeamSetting[];
}

export const DEFAULT_WIP_SETTINGS: WipSettingsValue = {
  startStatuses: DEFAULT_WIP_START_STATUSES,
  endStatuses: DEFAULT_WIP_END_STATUSES,
  defaultMaxPerDev: DEFAULT_MAX_TICKETS_PER_DEV,
  teams: [],
};

const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function validateStatuses(raw: unknown, label: string, errors: string[]): string[] {
  if (!Array.isArray(raw)) {
    errors.push(`${label} doit être une liste de statuts`);
    return [];
  }
  const out = Array.from(new Set(raw.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0)));
  if (out.length === 0) errors.push(`${label} : au moins un statut est obligatoire`);
  if (out.length > MAX_STATUSES) errors.push(`${label} : ${MAX_STATUSES} statuts au maximum`);
  // Un nom de statut va dans une requête JQL entre guillemets : on refuse les caractères qui la casseraient.
  if (out.some((s) => /["\\]/.test(s) || s.length > 100)) errors.push(`${label} : nom de statut invalide`);
  return out;
}

/**
 * Valide et normalise les réglages reçus. Renvoie les erreurs (en français) ou la valeur propre :
 * noms tronqués, doublons de statuts retirés, doublons d'équipes refusés.
 */
export function validateWipSettings(raw: unknown): { ok: true; value: WipSettingsValue } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const input = (raw ?? {}) as Partial<Record<keyof WipSettingsValue, unknown>>;

  const startStatuses = validateStatuses(input.startStatuses ?? DEFAULT_WIP_START_STATUSES, 'Statuts de départ', errors);
  const endStatuses = validateStatuses(input.endStatuses ?? DEFAULT_WIP_END_STATUSES, "Statuts d'arrivée", errors);
  const overlap = startStatuses.filter((s) => endStatuses.some((e) => e.toLowerCase() === s.toLowerCase()));
  if (overlap.length > 0) errors.push(`Un statut ne peut pas être à la fois de départ et d'arrivée : ${overlap.join(', ')}`);

  const defaultMaxPerDev = input.defaultMaxPerDev ?? DEFAULT_MAX_TICKETS_PER_DEV;
  if (!isIntIn(defaultMaxPerDev, 1, MAX_TICKETS_PER_DEV)) {
    errors.push(`Le maximum de tickets par dev doit être un entier entre 1 et ${MAX_TICKETS_PER_DEV}`);
  }

  const teamsRaw = input.teams ?? [];
  const teams: WipTeamSetting[] = [];
  if (!Array.isArray(teamsRaw)) {
    errors.push('teams doit être une liste');
  } else {
    const seen = new Set<string>();
    teamsRaw.forEach((t, i) => {
      const row = (t ?? {}) as { team?: unknown; devCount?: unknown; maxPerDev?: unknown };
      const team = typeof row.team === 'string' ? row.team.trim() : '';
      if (!team) {
        errors.push(`Équipe n°${i + 1} : le nom est obligatoire`);
        return;
      }
      if (team === NO_TEAM) {
        errors.push(`« ${NO_TEAM} » ne peut pas avoir de seuil`);
        return;
      }
      if (seen.has(team.toLowerCase())) {
        errors.push(`Équipe en double : ${team}`);
        return;
      }
      seen.add(team.toLowerCase());
      if (!isIntIn(row.devCount, 0, MAX_DEV_COUNT)) {
        errors.push(`${team} : le nombre de devs doit être un entier entre 0 et ${MAX_DEV_COUNT}`);
        return;
      }
      const maxPerDev = row.maxPerDev ?? null;
      if (maxPerDev !== null && !isIntIn(maxPerDev, 1, MAX_TICKETS_PER_DEV)) {
        errors.push(`${team} : le maximum de tickets par dev doit être un entier entre 1 et ${MAX_TICKETS_PER_DEV}`);
        return;
      }
      teams.push({ team, devCount: row.devCount, maxPerDev });
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { startStatuses, endStatuses, defaultMaxPerDev: defaultMaxPerDev as number, teams } };
}

/** Seuil d'une équipe, ou null si son nombre de devs n'est pas renseigné (ou vaut 0). */
export function teamWipThreshold(settings: WipSettingsValue, team: string): number | null {
  const row = settings.teams.find((t) => t.team.toLowerCase() === team.trim().toLowerCase());
  if (!row || row.devCount <= 0) return null;
  return row.devCount * (row.maxPerDev ?? settings.defaultMaxPerDev);
}
