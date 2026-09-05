/**
 * Logique métier Roadmap Adoria (Monday) : dates, trimestres, statuts, KPI, kanban,
 * macro chiffrage / estimation (détection colonnes, parsing numérique, « manquant » pour encarts).
 * Extraite de ProduitDashboard pour tests unitaires et réutilisation.
 */
import type { MondayColumn, MondayItem } from '../services/api';

export const CP_REFERENT_KEYS = ['cp référent', 'cp referent', 'cp réf', 'référent', 'referent'];
/** Colonne « SOLUTION DOC » (Monday) — manquant si valeur vide ou « - ». */
export const SOLUTION_DOC_KEYS = ['solution doc', 'solutiondoc', 'doc solution'];
export const STATUS_KEYS = ['status', 'statut', 'état', 'state'];
/** Colonne Monday « Team » (statut équipes). */
export const TEAM_KEYS = ['team', 'équipe', 'equipe'];

/**
 * Libellés Team connus sur Roadmap Adoria 2026 (colonne status Monday).
 * Utilisés pour proposer toutes les options de filtre même si absentes des items chargés.
 */
export const ROADMAP_ADORIA_KNOWN_TEAMS = [
  'To define',
  'Team Calson',
  'Softcam',
  'Team Cook',
  'IA',
  'UI / UX',
  'Team SRE',
  'IT',
  'DBA / PBI',
  'Team QA',
  'Quenteam',
] as const;

/** Détection colonne « macro chiffrage » (même règles que le diagramme Roadmap). */
export const ROADMAP_MACRO_CHIFFRAGE_KEYS = [
  'macro chiffrage',
  'macro-chiffrage',
  'macrochiffrage',
  'chiffrage macro',
];
/** Détection colonne « estimation » (même règles que le diagramme Roadmap). */
export const ROADMAP_ESTIMATION_KEYS = [
  'estimation',
  'estimate',
  'chiffrage initial',
  'effort estimé',
  'effort estime',
  'jours estimés',
  'jours estimes',
];

/** Valeur considérée comme absente pour Solution doc (vide ou tiret). */
export function isRoadmapSolutionDocValueMissing(raw: string): boolean {
  const v = raw.trim();
  return v === '' || v === '-';
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'");
}

export function findColumnByKeywords(columns: MondayColumn[], keywords: string[]): MondayColumn | null {
  return (
    columns.find((c) => keywords.some((k) => normalizeTitle(c.title).includes(normalizeTitle(k)))) ?? null
  );
}

/** Comme findColumnByKeywords, mais essaie les mots-clés du plus long au plus court (évite faux positifs courts). */
export function findColumnPreferSpecific(columns: MondayColumn[], keywords: string[]): MondayColumn | null {
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    const nk = normalizeTitle(k);
    const found = columns.find((c) => normalizeTitle(c.title).includes(nk));
    if (found) return found;
  }
  return null;
}

function parseNumLike(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/\s/g, '').replace(',', '.').replace(/%/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Valeur numérique Monday (colonne numbers, JSON, texte). */
export function getMondayItemNumericValue(item: MondayItem, columnId: string): number {
  const cv = item.column_values?.find((c) => String(c.id) === String(columnId));
  if (!cv) return 0;
  const text = (cv.text ?? '').toString().trim();
  const rawValue = (cv.value ?? '').toString().trim();
  const rawVal = (cv as { value?: unknown }).value;
  if (typeof rawVal === 'number' && Number.isFinite(rawVal)) return rawVal;
  if (rawValue.startsWith('{')) {
    try {
      const o = JSON.parse(rawValue) as Record<string, unknown>;
      const num = o.number ?? o.value ?? o.num;
      if (num !== undefined && num !== null) {
        const n = typeof num === 'number' ? num : parseNumLike(String(num));
        return Number.isFinite(n) ? n : 0;
      }
    } catch {
      // ignore
    }
  }
  const fromText = parseNumLike(text || rawValue);
  if (Number.isFinite(fromText)) return fromText;
  return 0;
}

/** Colonnes macro chiffrage / estimation (deux colonnes distinctes si possible). */
export function resolveRoadmapMacroEstimationColumns(columns: MondayColumn[]): {
  macro: MondayColumn | null;
  est: MondayColumn | null;
} {
  const macro = findColumnPreferSpecific(columns, ROADMAP_MACRO_CHIFFRAGE_KEYS);
  const others = macro ? columns.filter((c) => c.id !== macro.id) : columns;
  const est = findColumnPreferSpecific(others, ROADMAP_ESTIMATION_KEYS);
  return { macro, est };
}

/** KPI encart : manquant si vide / « - » / non numérique / ≤ 0 (cohérent avec le diagramme qui ignore les paires nulles). */
export function isRoadmapNumericKpiValueMissing(item: MondayItem, col: MondayColumn | null): boolean {
  if (!col) return false;
  const text = getItemValue(item, col.id);
  if (isRoadmapSolutionDocValueMissing(text)) return true;
  const n = getMondayItemNumericValue(item, col.id);
  return !Number.isFinite(n) || n <= 0;
}

export function findRoadmapDateColumn(columns: MondayColumn[]): MondayColumn | null {
  return columns.find((c) => normalizeTitle(c.title) === 'date') ?? null;
}

export function findRoadmapPmColumn(columns: MondayColumn[]): MondayColumn | null {
  const exact = columns.find((c) => normalizeTitle(c.title) === 'pm');
  if (exact) return exact;
  return findColumnByKeywords(columns, ['product manager', 'chef de produit']);
}

/** Monday date: JSON {"date":"YYYY-MM-DD"} ou ISO, texte DD/MM/YYYY. */
export function parseMondayDateString(value: string): Date | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  let dateStr: string | unknown = trimmed;
  try {
    if (trimmed.startsWith('{')) {
      const o = JSON.parse(trimmed) as { date?: string };
      dateStr = o.date ?? trimmed;
    }
  } catch {
    // ignore
  }
  if (typeof dateStr !== 'string') return null;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const dmy = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const d = new Date(parseInt(dmy[3], 10), parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = Date.parse(dateStr);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export type CalendarQuarter = 1 | 2 | 3 | 4;

export function calendarQuarterFromDate(d: Date): CalendarQuarter {
  const m = d.getMonth() + 1;
  if (m <= 3) return 1;
  if (m <= 6) return 2;
  if (m <= 9) return 3;
  return 4;
}

export function parseRoadmapDateColumnEndDate(raw: string): Date | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const isoMatches = trimmed.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoMatches && isoMatches.length >= 2) return parseMondayDateString(isoMatches[1]);
  if (isoMatches && isoMatches.length === 1) return parseMondayDateString(isoMatches[0]);
  return parseMondayDateString(trimmed);
}

export function parseRoadmapDateColumnRange(raw: string): { start: Date | null; end: Date | null } {
  if (!raw || typeof raw !== 'string') return { start: null, end: null };
  const trimmed = raw.trim();
  const isoMatches = trimmed.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoMatches && isoMatches.length >= 2) {
    return {
      start: parseMondayDateString(isoMatches[0]),
      end: parseMondayDateString(isoMatches[1]),
    };
  }
  if (isoMatches && isoMatches.length === 1) {
    const d = parseMondayDateString(isoMatches[0]);
    return { start: d, end: d };
  }
  const d = parseMondayDateString(trimmed);
  return { start: d, end: d };
}

export function roadmapRangeFullyInQuarter(start: Date, end: Date, qTarget: CalendarQuarter): boolean {
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  if (start.getFullYear() !== end.getFullYear()) return false;
  return calendarQuarterFromDate(start) === qTarget && calendarQuarterFromDate(end) === qTarget;
}

export function roadmapRangeFullyInQuarterCurrentYear(
  start: Date,
  end: Date,
  qTarget: CalendarQuarter,
  currentYear: number
): boolean {
  if (!roadmapRangeFullyInQuarter(start, end, qTarget)) return false;
  return start.getFullYear() === currentYear;
}

export function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function getQuarterEndDate(year: number, q: CalendarQuarter): Date {
  const monthIndex = q === 1 ? 2 : q === 2 ? 5 : q === 3 ? 8 : 11;
  const day = q === 1 ? 31 : q === 2 ? 30 : q === 3 ? 30 : 31;
  return new Date(year, monthIndex, day, 23, 59, 59, 999);
}

export function calendarDaysInclusiveFromTodayToQuarterEnd(now: Date, quarterEnd: Date): number {
  const t = startOfDayLocal(now).getTime();
  const e = startOfDayLocal(quarterEnd).getTime();
  if (e < t) return 0;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((e - t) / dayMs) + 1;
}

export function getItemValue(item: MondayItem, columnId: string): string {
  const cv = item.column_values?.find((c) => String(c.id) === String(columnId));
  return (cv?.text ?? cv?.value ?? '').toString().trim();
}

export function getRoadmapDateColumnRaw(item: MondayItem, columnId: string): string {
  const cv = item.column_values?.find((c) => String(c.id) === String(columnId));
  if (!cv) return '';
  const text = (cv.text ?? '').toString().trim();
  if (text) return text;
  const rawValue = (cv.value ?? '').toString().trim();
  if (rawValue.startsWith('{')) {
    try {
      const o = JSON.parse(rawValue) as Record<string, unknown>;
      const s = o.text ?? o.chosen ?? o.to ?? o.from;
      if (typeof s === 'string' && s.trim()) return s.trim();
      if (o.dates && typeof o.dates === 'object' && o.dates !== null) {
        const dates = o.dates as { to?: string; from?: string };
        if (dates.to && dates.from) return `${String(dates.from)} - ${String(dates.to)}`;
      }
    } catch {
      // ignore
    }
  }
  return rawValue;
}

export function getRoadmapItemStatusLabel(item: MondayItem, col: MondayColumn): string {
  const statusVal = getItemValue(item, col.id);
  return statusVal || 'Non renseigné';
}

export function getRoadmapItemTeamLabel(item: MondayItem, col: MondayColumn): string {
  const teamVal = getItemValue(item, col.id);
  return teamVal || 'Non renseigné';
}

/** Options de filtre Team : équipes connues ∪ valeurs présentes sur le board. */
export function buildRoadmapTeamFilterOptions(
  items: MondayItem[],
  teamColumn: MondayColumn | null,
  knownTeams: readonly string[] = ROADMAP_ADORIA_KNOWN_TEAMS
): string[] {
  const labels = new Set<string>(knownTeams);
  if (teamColumn) {
    for (const item of items) {
      labels.add(getRoadmapItemTeamLabel(item, teamColumn));
    }
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b, 'fr'));
}

export function isRoadmapStatusDone(statusLabel: string): boolean {
  const n = statusLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!n.trim()) return false;
  const doneKeywords = [
    'done',
    'terminé',
    'termine',
    'terminée',
    'terminee',
    'closed',
    'fermé',
    'ferme',
    'livré',
    'livre',
    'completed',
    'complete',
    'réalisé',
    'realise',
    'déployé',
    'deploye',
    'validé',
    'valide',
    'achevé',
    'acheve',
  ];
  return doneKeywords.some((k) => n.includes(k));
}

export function isRoadmapStatusTodo(statusLabel: string): boolean {
  const n = statusLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!n.trim()) return false;
  const todoKeywords = [
    'to do',
    'todo',
    'à faire',
    'a faire',
    'backlog',
    'nouveau',
    'new',
    'planifié',
    'planifie',
    'proposé',
    'propose',
    'brouillon',
    'draft',
    'en attente',
    'waiting',
    'queued',
  ];
  return todoKeywords.some((k) => n.includes(k));
}

export type RoadmapKanbanBucket = 'done' | 'todo' | 'encours' | 'retard';

export function classifyRoadmapKanbanBucket(
  item: MondayItem,
  roadmapStatusColumn: MondayColumn | null,
  roadmapDateColumn: MondayColumn | null,
  now: Date
): RoadmapKanbanBucket {
  const statusLabel = roadmapStatusColumn ? getRoadmapItemStatusLabel(item, roadmapStatusColumn) : 'Non renseigné';
  const done = isRoadmapStatusDone(statusLabel);
  let endDate: Date | null = null;
  if (roadmapDateColumn) {
    const raw = getRoadmapDateColumnRaw(item, roadmapDateColumn.id);
    endDate = parseRoadmapDateColumnEndDate(raw);
  }
  const overdue =
    !!endDate && startOfDayLocal(endDate).getTime() < startOfDayLocal(now).getTime();
  if (overdue && !done) return 'retard';
  if (done) return 'done';
  if (isRoadmapStatusTodo(statusLabel)) return 'todo';
  return 'encours';
}

export const EMPTY_ROADMAP_KPIS = {
  totalFeatures: 0,
  withCpReferent: 0,
  missingCpReferent: 0,
  missingSolutionDoc: 0,
  hasSolutionDocColumn: false,
  missingMacroChiffrage: 0,
  missingEstimation: 0,
  hasMacroChiffrageColumn: false,
  hasEstimationColumn: false,
  ratioCpReferentPct: 0,
  byCpReferent: [] as { name: string; count: number }[],
  byPm: [] as { name: string; count: number }[],
  byStatus: [] as { name: string; value: number }[],
};

export function computeRoadmapKpis(
  items: MondayItem[],
  columns: MondayColumn[]
): {
  totalFeatures: number;
  withCpReferent: number;
  missingCpReferent: number;
  missingSolutionDoc: number;
  hasSolutionDocColumn: boolean;
  missingMacroChiffrage: number;
  missingEstimation: number;
  hasMacroChiffrageColumn: boolean;
  hasEstimationColumn: boolean;
  ratioCpReferentPct: number;
  byCpReferent: { name: string; count: number }[];
  byPm: { name: string; count: number }[];
  byStatus: { name: string; value: number }[];
} | null {
  const colCpReferent = findColumnByKeywords(columns, CP_REFERENT_KEYS);
  const colSolutionDoc = findColumnByKeywords(columns, SOLUTION_DOC_KEYS);
  const colPm = findRoadmapPmColumn(columns);
  const colStatus = findColumnByKeywords(columns, STATUS_KEYS);
  const { macro: colMacro, est: colEst } = resolveRoadmapMacroEstimationColumns(columns);
  const totalFeatures = items.length;
  if (totalFeatures === 0) return null;

  let withCpReferent = 0;
  let missingSolutionDoc = 0;
  let missingMacroChiffrage = 0;
  let missingEstimation = 0;
  const cpReferentCount = new Map<string, number>();
  const pmCount = new Map<string, number>();
  const statusCount = new Map<string, number>();

  for (const item of items) {
    const cpVal = colCpReferent ? getItemValue(item, colCpReferent.id) : '';
    const hasCp = !!cpVal && cpVal.toLowerCase() !== 'sans nom' && cpVal !== '-';
    if (colSolutionDoc) {
      const solVal = getItemValue(item, colSolutionDoc.id);
      if (isRoadmapSolutionDocValueMissing(solVal)) missingSolutionDoc += 1;
    }
    if (colMacro && isRoadmapNumericKpiValueMissing(item, colMacro)) missingMacroChiffrage += 1;
    if (colEst && isRoadmapNumericKpiValueMissing(item, colEst)) missingEstimation += 1;
    if (hasCp) {
      withCpReferent += 1;
      cpReferentCount.set(cpVal, (cpReferentCount.get(cpVal) ?? 0) + 1);
    }
    if (colPm) {
      const rawPm = getItemValue(item, colPm.id).trim();
      const pmLabel =
        rawPm && rawPm !== '-' && rawPm.toLowerCase() !== 'sans nom' ? rawPm : 'Non attribués';
      pmCount.set(pmLabel, (pmCount.get(pmLabel) ?? 0) + 1);
    }
    const statusVal = colStatus ? getItemValue(item, colStatus.id) : '';
    const statusLabel = statusVal || 'Non renseigné';
    statusCount.set(statusLabel, (statusCount.get(statusLabel) ?? 0) + 1);
  }

  const missingCpReferent = totalFeatures - withCpReferent;
  const ratioCpReferentPct = totalFeatures > 0 ? (withCpReferent / totalFeatures) * 100 : 0;
  const byCpReferent = Array.from(cpReferentCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const byPm = Array.from(pmCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const byStatus = Array.from(statusCount.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return {
    totalFeatures,
    withCpReferent,
    missingCpReferent,
    missingSolutionDoc,
    hasSolutionDocColumn: !!colSolutionDoc,
    missingMacroChiffrage,
    missingEstimation,
    hasMacroChiffrageColumn: !!colMacro,
    hasEstimationColumn: !!colEst,
    ratioCpReferentPct,
    byCpReferent,
    byPm,
    byStatus,
  };
}

/** Identifiants des encarts « Sans … » (un par contrôle qualité de la Roadmap). */
export type RoadmapMissingIndicatorId =
  | 'cp'
  | 'solutionDoc'
  | 'wireframe'
  | 'maquette'
  | 'macroChiffrage'
  | 'estimation'
  | 'devis'
  | 'validationClient'
  | 'validationClients'
  | 'validationOperationnelle'
  | 'validationMarketing'
  | 'clientsPilotes'
  | 'epic';

/**
 * Règle décidant si la cellule d'une ligne est « manquante » :
 * - `person` : vide, « - » ou « sans nom » ;
 * - `blank` : vide ou « - » (liens, fichiers, listes déroulantes) ;
 * - `numeric` : vide, non numérique ou ≤ 0 ;
 * - `checkbox` : case non cochée.
 */
export type RoadmapMissingRule = 'person' | 'blank' | 'numeric' | 'checkbox';

export interface RoadmapMissingIndicatorDef {
  id: RoadmapMissingIndicatorId;
  /** Libellé de l'encart, aligné sur les vues Monday « Sans … ». */
  label: string;
  /** Titres de colonne Monday acceptés : égalité exacte d'abord, puis inclusion. */
  columnTitles: string[];
  rule: RoadmapMissingRule;
  /** Explication courte affichée sous le compteur. */
  hint: string;
  /**
   * Colonne « … requis ? » : la ligne n'entre dans le périmètre que si sa valeur
   * est listée (les lignes « NON » ne sont ni comptées ni décomptées).
   */
  gate?: { columnTitles: string[]; values: string[] };
}

/** Valeurs de colonne « … requis ? » qui rendent le contrôle applicable. */
export const ROADMAP_REQUIS_GATE_VALUES = ['oui', 'à définir'];

/**
 * Les 13 contrôles « Sans … » du board Roadmap Adoria 2026, dans l'ordre d'affichage.
 * Chaque entrée reprend la colonne testée par la vue Monday du même nom.
 */
export const ROADMAP_MISSING_INDICATORS: RoadmapMissingIndicatorDef[] = [
  {
    id: 'cp',
    label: 'Sans CP référent',
    columnTitles: ['CP référent', ...CP_REFERENT_KEYS],
    rule: 'person',
    hint: 'Aucune personne assignée.',
  },
  {
    id: 'macroChiffrage',
    label: 'Sans macro chiffrage',
    columnTitles: ['Macro chiffrage', ...ROADMAP_MACRO_CHIFFRAGE_KEYS],
    rule: 'numeric',
    hint: 'Vide, « - » ou ≤ 0.',
  },
  {
    id: 'solutionDoc',
    label: 'Sans solution doc',
    columnTitles: ['Solution doc', ...SOLUTION_DOC_KEYS],
    rule: 'blank',
    hint: 'Lien vide ou « - ».',
  },
  {
    id: 'wireframe',
    label: 'Sans wireframe',
    columnTitles: ['Wireframe'],
    rule: 'blank',
    hint: 'Wireframe requis, lien absent.',
    gate: { columnTitles: ['Wireframe requis ?'], values: ROADMAP_REQUIS_GATE_VALUES },
  },
  {
    id: 'estimation',
    label: 'Sans estimation',
    columnTitles: ['Estimation', ...ROADMAP_ESTIMATION_KEYS],
    rule: 'numeric',
    hint: 'Vide, « - » ou ≤ 0.',
  },
  {
    id: 'devis',
    label: 'Sans devis',
    columnTitles: ['Devis'],
    rule: 'blank',
    hint: 'Aucun fichier joint.',
  },
  {
    id: 'validationClient',
    label: 'Sans Validation client devis',
    columnTitles: ['Validation client'],
    rule: 'checkbox',
    hint: 'Case non cochée.',
  },
  {
    id: 'clientsPilotes',
    label: 'Sans clients pilotes',
    columnTitles: ['Clients pilotes'],
    rule: 'blank',
    hint: 'Aucun client sélectionné.',
  },
  {
    id: 'maquette',
    label: 'Sans maquettes',
    columnTitles: ['Lien vers la maquette', 'maquette'],
    rule: 'blank',
    hint: 'Maquette requise, lien absent.',
    gate: { columnTitles: ['Maquettes requis ?'], values: ROADMAP_REQUIS_GATE_VALUES },
  },
  {
    id: 'validationOperationnelle',
    label: 'Sans validation opérationnelle',
    columnTitles: ['Validation opérationnelle'],
    rule: 'checkbox',
    hint: 'Case non cochée.',
  },
  {
    id: 'validationClients',
    label: 'Sans validation client finale',
    columnTitles: ['Validation clients'],
    rule: 'checkbox',
    hint: 'Case non cochée.',
  },
  {
    id: 'validationMarketing',
    label: 'Sans validation marketing',
    columnTitles: ['Validation marketing'],
    rule: 'checkbox',
    hint: 'Marketing requis, case non cochée.',
    gate: { columnTitles: ['Marketing requis ?'], values: ROADMAP_REQUIS_GATE_VALUES },
  },
  {
    id: 'epic',
    label: 'Sans Epic',
    columnTitles: ['Lien Epic', 'epic'],
    rule: 'blank',
    hint: 'Lien Jira absent.',
  },
];

/** Normalisation de titre insensible à la casse, aux accents et aux espaces multiples. */
export function normalizeRoadmapColumnTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Colonne correspondant à l'un des titres : égalité exacte d'abord (évite que
 * « Wireframe » capte « Wireframe requis ? » ou « Devis » capte « Jours devis »),
 * puis inclusion, en ignorant les colonnes déjà attribuées.
 */
export function findRoadmapColumnByTitles(
  columns: MondayColumn[],
  titles: string[],
  excludedIds: ReadonlySet<string> = new Set()
): MondayColumn | null {
  const available = columns.filter((c) => !excludedIds.has(c.id));
  for (const title of titles) {
    const nt = normalizeRoadmapColumnTitle(title);
    const exact = available.find((c) => normalizeRoadmapColumnTitle(c.title) === nt);
    if (exact) return exact;
  }
  for (const title of [...titles].sort((a, b) => b.length - a.length)) {
    const nt = normalizeRoadmapColumnTitle(title);
    const partial = available.find((c) => normalizeRoadmapColumnTitle(c.title).includes(nt));
    if (partial) return partial;
  }
  return null;
}

/** Colonne testée + colonne « … requis ? » de chaque encart, sans collision entre indicateurs. */
export function resolveRoadmapMissingIndicatorColumns(
  columns: MondayColumn[],
  defs: RoadmapMissingIndicatorDef[] = ROADMAP_MISSING_INDICATORS
): Map<RoadmapMissingIndicatorId, { column: MondayColumn | null; gateColumn: MondayColumn | null }> {
  const used = new Set<string>();
  const gateColumns = new Map<RoadmapMissingIndicatorId, MondayColumn | null>();
  for (const def of defs) {
    if (!def.gate) {
      gateColumns.set(def.id, null);
      continue;
    }
    const gate = findRoadmapColumnByTitles(columns, def.gate.columnTitles, used);
    if (gate) used.add(gate.id);
    gateColumns.set(def.id, gate);
  }
  const resolved = new Map<
    RoadmapMissingIndicatorId,
    { column: MondayColumn | null; gateColumn: MondayColumn | null }
  >();
  const pending: RoadmapMissingIndicatorDef[] = [];
  for (const def of defs) {
    const nt = def.columnTitles.map(normalizeRoadmapColumnTitle);
    const exact = columns.find((c) => !used.has(c.id) && nt.includes(normalizeRoadmapColumnTitle(c.title)));
    if (exact) {
      used.add(exact.id);
      resolved.set(def.id, { column: exact, gateColumn: gateColumns.get(def.id) ?? null });
    } else {
      pending.push(def);
    }
  }
  for (const def of pending) {
    const column = findRoadmapColumnByTitles(columns, def.columnTitles, used);
    if (column) used.add(column.id);
    resolved.set(def.id, { column, gateColumn: gateColumns.get(def.id) ?? null });
  }
  return resolved;
}

/** Case à cocher Monday non cochée (texte vide et `value` sans `checked: true`). */
export function isRoadmapCheckboxUnchecked(item: MondayItem, col: MondayColumn): boolean {
  const cv = item.column_values?.find((c) => String(c.id) === String(col.id));
  if (!cv) return true;
  if ((cv.text ?? '').toString().trim()) return false;
  const raw = (cv.value ?? '').toString();
  return !/"checked"\s*:\s*(true|"true")/.test(raw);
}

/** Applique la règle « manquant » d'un encart à une ligne. */
export function isRoadmapIndicatorValueMissing(
  item: MondayItem,
  col: MondayColumn | null,
  rule: RoadmapMissingRule
): boolean {
  if (!col) return false;
  if (rule === 'numeric') return isRoadmapNumericKpiValueMissing(item, col);
  if (rule === 'checkbox') return isRoadmapCheckboxUnchecked(item, col);
  const value = getItemValue(item, col.id);
  if (rule === 'person') {
    const v = value.trim();
    return v === '' || v === '-' || v.toLowerCase() === 'sans nom';
  }
  return isRoadmapSolutionDocValueMissing(value);
}

/** Ligne concernée par l'encart : vrai si aucune colonne « … requis ? » ou si sa valeur est listée. */
export function isRoadmapIndicatorRowApplicable(
  item: MondayItem,
  gateColumn: MondayColumn | null,
  gateValues: string[] | undefined
): boolean {
  if (!gateColumn || !gateValues?.length) return true;
  const value = normalizeRoadmapColumnTitle(getItemValue(item, gateColumn.id));
  return gateValues.some((v) => normalizeRoadmapColumnTitle(v) === value);
}

export interface RoadmapMissingIndicator {
  def: RoadmapMissingIndicatorDef;
  column: MondayColumn | null;
  gateColumn: MondayColumn | null;
  hasColumn: boolean;
  /** Lignes entrant dans le périmètre du contrôle (après colonne « … requis ? »). */
  applicableCount: number;
  missingCount: number;
  /** Lignes manquantes, triées par nom — utilisées par la modale de détail. */
  missingItems: MondayItem[];
}

/**
 * Compteurs des encarts « Sans … » sur les lignes déjà filtrées (trimestre / statut / team).
 * Une colonne absente du board donne `hasColumn: false` et un compteur à 0.
 */
export function computeRoadmapMissingIndicators(
  items: MondayItem[],
  columns: MondayColumn[],
  defs: RoadmapMissingIndicatorDef[] = ROADMAP_MISSING_INDICATORS
): RoadmapMissingIndicator[] {
  const resolved = resolveRoadmapMissingIndicatorColumns(columns, defs);
  return defs.map((def) => {
    const { column, gateColumn } = resolved.get(def.id) ?? { column: null, gateColumn: null };
    const applicable = column
      ? items.filter((item) => isRoadmapIndicatorRowApplicable(item, gateColumn, def.gate?.values))
      : [];
    const missingItems = applicable
      .filter((item) => isRoadmapIndicatorValueMissing(item, column, def.rule))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
    return {
      def,
      column,
      gateColumn,
      hasColumn: !!column,
      applicableCount: applicable.length,
      missingCount: missingItems.length,
      missingItems,
    };
  });
}
