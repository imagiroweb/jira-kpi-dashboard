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
