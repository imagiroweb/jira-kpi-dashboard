/**
 * Logique métier Suivi clients (Monday) : KPI agrégés, dates, labels caisse, workspace Roadmap.
 * Extraite de ProduitDashboard pour tests unitaires et réutilisation.
 */
import type { MondayColumn, MondayItem } from '../services/api';
import {
  findColumnByKeywords,
  findColumnPreferSpecific,
  getItemValue,
  getMondayItemNumericValue,
  parseMondayDateString,
} from './roadmapAdoriaKpi';

export const PAYS_COLUMN_KEYS = ['pays', 'country', 'country code', 'nationalité', 'nationalite'];
export const SITES_ACTIFS_KEYS = ['sites actifs', 'sites_actifs', 'active sites', 'nb sites', 'nombre de sites'];
export const TARGET_KEYS = ['target', 'objectif', 'cible', 'goal'];
export const CDC_KEYS = ['cdc déployé', 'cdc', 'cdc deployé', 'cdc deploye', 'cdc déploye'];
export const COMMANDES_VIA_CDC_KEYS = [
  'kpi adoria - nombre de commandes générées via le cdc',
  'kpi adoria -nombre de commandes générées via le cdc',
  'nombre de commandes générées via le cdc',
  'commandes générées via le cdc',
  'commandes generees via le cdc',
];
export const SYSTEME_CAISSE_ACTIF_KEYS = [
  'système de caisse actif',
  'systeme de caisse actif',
  'système de caisse',
  'systeme de caisse',
  'caisse actif',
];
export const DATE_MISE_EN_PROD_KEYS = [
  'roll out end date',
  'lancement en production',
  'date mise en production',
  'mise en production',
  'go live',
  'lancement production',
  'date de lancement en production',
  'date lancement production',
  'production',
  'date prod',
];
export const PROJECT_START_DATE_KEYS = [
  'project start date',
  'date début projet',
  'start date',
  'date de début',
  'début projet',
  'date start',
  'date début',
  'début',
];
/** Statut Monday « Initial roll out » (Done / In progress / Stuck). */
export const INITIAL_ROLL_OUT_KEYS = ['initial roll out', 'roll out initial'];
export const TOTAL_PROJETS_KEYS = ['total projets', 'nb projets', 'nombre projets', 'total', 'projets'];
export const UTILISATEURS_ACTIFS_KEYS = [
  "kpi adoria - nbre d'utilisateurs actifs",
  "kpi adoria - nbre d\u2019utilisateurs actifs",
  'kpi adoria - nbre utilisateurs actifs',
  "nbre d'utilisateurs actifs",
  'utilisateurs actifs',
  'nb utilisateurs actifs',
  'nombre utilisateurs actifs',
  'users actifs',
  'active users',
];
export const UTILISATEURS_BRUTS_KEYS = [
  "kpi adoria - nbre d'utilisateurs bruts",
  'utilisateurs bruts',
  'nb utilisateurs bruts',
  'nombre utilisateurs bruts',
];
export const REFERENCES_MERCURIAL_KEYS = ['références mercurial', 'references mercurial', 'ref mercurial', 'mercurial', 'nb ref mercurial'];
export const FICHES_TECHNIQUES_ACTIVES_KEYS = ['fiches techniques actives', 'fiche technique active', 'ft actives', 'nb ft actives'];
export const FICHES_TECHNIQUES_BRUT_KEYS = [
  'kpi adoria - nombre brut de fiches techniques',
  'fiches techniques brut',
  'fiches techniques brutes',
  'ft brut',
  'ft brutes',
  'nb ft brut',
];
export const PRODUITS_GENERIQUES_BRUT_KEYS = [
  'produits génériques brut',
  'total produits génériques brut',
  'nb produits génériques brut',
  'nombre produits génériques brut',
  'produits generiques brut',
];
export const PRODUITS_GENERIQUES_ACTIFS_KEYS = [
  'produits génériques actifs',
  'produits génériques actifs brut',
  'nb produits génériques actifs',
  'produits generiques actifs',
];
export const UTILISATION_MOBILE_KEYS = [
  'utilisation mobile',
  'nb utilisation mobile',
  'nombre utilisation mobile',
  'total utilisation mobile',
  'mobile',
];

export const ROADMAP_ADORIA_2026_KEYS = [
  'roadmap adoria 2026',
  'roadmap adoria',
  'adoria 2026',
  'roadmap 2026',
  'roadmap adoria',
];

/** ID colonne « KPI adoria - Nbre d'utilisateurs actifs » (board Suivi Monday). */
export const SUIVI_UTILISATEURS_ACTIFS_COLUMN_ID = 'numeric_mkxpq040';
/** ID colonne CDC déployé (board Suivi Monday). */
export const SUIVI_CDC_DEPLOYE_COLUMN_ID = 'numeric_mkwxdthf';

/** Workspace name for Roadmap Adoria 2026 (exact or partial match). */
export function isRoadmapAdoria2026Workspace(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const n = name.toLowerCase().trim();
  if (n.includes('roadmap') && (n.includes('adoria') || n.includes('2026'))) return true;
  return ROADMAP_ADORIA_2026_KEYS.some((k) => n.includes(k));
}

/** Écart relatif symétrique (%) entre deux valeurs Monday ; 0 si les deux sont nuls. */
export function mondayMacroEstimateDiffPct(a: number, b: number): number {
  const m = Math.max(0, a);
  const e = Math.max(0, b);
  const denom = Math.max(m, e);
  if (denom <= 0) return 0;
  return (100 * Math.abs(m - e)) / denom;
}

/** Libellé affiché pour une colonne Monday (texte, statut, liste, etc.). */
export function getItemColumnLabelText(item: MondayItem, columnId: string): string {
  const cv = item.column_values?.find((c) => String(c.id) === String(columnId));
  let text = (cv?.text ?? '').toString().trim();
  const rawValue = (cv?.value ?? '').toString().trim();
  if (!text && rawValue) {
    if (rawValue.startsWith('{')) {
      try {
        const o = JSON.parse(rawValue) as Record<string, unknown>;
        const v = o.label ?? o.text ?? o.name ?? o.value;
        if (v !== undefined && v !== null && typeof v !== 'object') {
          text = String(v).trim();
        }
      } catch {
        text = rawValue;
      }
    } else {
      text = rawValue;
    }
  }
  return text;
}

/** Exclut les cellules « vides » / non renseignées pour l’agrégat système de caisse. */
export function isDefinedCaisseLabel(label: string): boolean {
  const s = label.trim();
  if (!s) return false;
  const lower = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const compact = lower.replace(/\s+/g, ' ');
  const placeholders = new Set([
    '-',
    '—',
    '–',
    '…',
    '?',
    'n/a',
    'na',
    '#n/a',
    'n.a.',
    'n.a',
    'null',
    'undefined',
    'vide',
    'empty',
    'non defini',
    'non renseigne',
    'nr',
    'inconnu',
  ]);
  if (placeholders.has(compact)) return false;
  if (compact.length <= 1 && /^[-–—.?]$/.test(s)) return false;
  return true;
}

/** Monday date: JSON {"date":"YYYY-MM-DD"} ou ISO, texte DD/MM/YYYY. */
export function parseDate(value: string): Date | null {
  return parseMondayDateString(value);
}

export function parseNum(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/\s/g, '').replace(',', '.').replace(/%/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Intégration client sans date de mise en prod, démarrée au plus tôt en année n−1. */
export type IntegrationEnCours = {
  itemId: string;
  clientName: string;
  /** Date de début projet (YYYY-MM-DD). */
  startDate: string;
  /** Jours calendaires écoulés entre la date de début et aujourd’hui. */
  ageJours: number;
  /** true si « Initial roll out » = Stuck. */
  stuck: boolean;
  /** Libellé brut du statut Initial roll out, si disponible. */
  rollOutStatus: string | null;
};

export type SuiviKpiResult = {
  sitesActifs: number;
  target: number;
  cdcDeploye: number;
  totalCommandesViaCdc: number;
  systemeCaisseWordCloud: { label: string; count: number }[];
  projetsAnneeEnCours: number;
  projectsByYear: { year: number; count: number; dureeMoyenneJours: number }[];
  dureeMoyenneMiseEnProdJours: number;
  dureeMinMiseEnProdJours: number;
  dureeMaxMiseEnProdJours: number;
  delaiByClient: { clientName: string; dureeJours: number }[];
  /** WIP : début renseigné, pas de prod, année début ≥ n−1 — trié par âge décroissant. */
  integrationsEnCours: IntegrationEnCours[];
  integrationsEnCoursStuckCount: number;
  integrationsEnCoursAgeMedianJours: number;
  integrationsEnCoursAgeMoyenJours: number;
  totalProjets: number;
  byPays: { name: string; value: number }[];
  totalUtilisateursActifs: number;
  totalUtilisateursBruts: number;
  totalReferencesMercurial: number;
  totalFichesTechniquesActives: number;
  totalFichesTechniquesBrut: number;
  totalProduitsGeneriquesBrut: number;
  totalProduitsGeneriquesActifs: number;
  totalUtilisationMobile: number;
};

/** Jours calendaires entre deux dates (minuit local). */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isStuckRollOutStatus(label: string | null | undefined): boolean {
  if (!label) return false;
  return label.trim().toLowerCase() === 'stuck';
}

/**
 * Code couleur âge WIP :
 * - stuck → marron
 * - &lt; 90 j → vert
 * - 90–180 j → jaune
 * - &gt; 180 j → orange
 */
export type IntegrationEnCoursAgeTone = 'fresh' | 'warming' | 'aging' | 'stuck';

export function integrationEnCoursAgeTone(ageJours: number, stuck: boolean): IntegrationEnCoursAgeTone {
  if (stuck) return 'stuck';
  if (ageJours < 90) return 'fresh';
  if (ageJours <= 180) return 'warming';
  return 'aging';
}

/** Classes Tailwind associées au ton d’âge (liste / modale). */
export const INTEGRATION_EN_COURS_TONE_UI: Record<
  IntegrationEnCoursAgeTone,
  { text: string; bar: string; row: string; badge: string; badgeText: string }
> = {
  fresh: {
    text: 'text-emerald-300',
    bar: 'bg-emerald-400/80',
    row: 'border-emerald-500/25 bg-emerald-500/5',
    badge: 'border-emerald-500/40 bg-emerald-500/15',
    badgeText: 'text-emerald-200',
  },
  warming: {
    text: 'text-yellow-300',
    bar: 'bg-yellow-400/80',
    row: 'border-yellow-500/30 bg-yellow-500/5',
    badge: 'border-yellow-500/40 bg-yellow-500/15',
    badgeText: 'text-yellow-100',
  },
  aging: {
    text: 'text-orange-300',
    bar: 'bg-orange-400/80',
    row: 'border-orange-500/30 bg-orange-500/5',
    badge: 'border-orange-500/40 bg-orange-500/15',
    badgeText: 'text-orange-100',
  },
  stuck: {
    text: 'text-amber-800',
    bar: 'bg-amber-900/80',
    row: 'border-amber-900/45 bg-amber-950/40',
    badge: 'border-amber-900/50 bg-amber-950/50',
    badgeText: 'text-amber-100',
  },
};

function medianRounded(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Intégrations en cours : date de début renseignée, pas de date de mise en prod,
 * année de début ≥ année courante − 1. Inclut le statut Stuck (Initial roll out) s’il existe.
 */
export function computeIntegrationsEnCours(
  items: MondayItem[],
  columns: MondayColumn[],
  now: Date = new Date()
): IntegrationEnCours[] {
  const colStart = findColumnPreferSpecific(columns, PROJECT_START_DATE_KEYS);
  const colProd = findColumnPreferSpecific(columns, DATE_MISE_EN_PROD_KEYS);
  const colRollOut = findColumnPreferSpecific(columns, INITIAL_ROLL_OUT_KEYS);
  if (!colStart) return [];

  const yearMin = now.getFullYear() - 1;
  const out: IntegrationEnCours[] = [];

  for (const item of items) {
    const start = parseDate(getItemValue(item, colStart.id));
    if (!start) continue;
    if (start.getFullYear() < yearMin) continue;
    const prod = colProd ? parseDate(getItemValue(item, colProd.id)) : null;
    if (prod) continue;

    const rollOutStatus = colRollOut ? getItemColumnLabelText(item, colRollOut.id) || null : null;
    out.push({
      itemId: item.id,
      clientName: item.name?.trim() || 'Sans nom',
      startDate: formatDateYmd(start),
      ageJours: calendarDaysBetween(start, now),
      stuck: isStuckRollOutStatus(rollOutStatus),
      rollOutStatus,
    });
  }

  return out.sort((a, b) => b.ageJours - a.ageJours || a.clientName.localeCompare(b.clientName, 'fr'));
}

export function computeSuiviKpis(items: MondayItem[], columns: MondayColumn[]): SuiviKpiResult {
  const findColumn = findColumnByKeywords;
  const getItemNumericValue = getMondayItemNumericValue;

  const colSitesActifs = findColumn(columns, SITES_ACTIFS_KEYS);
  const colTarget = findColumn(columns, TARGET_KEYS);
  const colCdc = columns.find((c) => String(c.id) === SUIVI_CDC_DEPLOYE_COLUMN_ID) ?? findColumn(columns, CDC_KEYS);
  const colCommandesViaCdc = findColumn(columns, COMMANDES_VIA_CDC_KEYS);
  const colSystemeCaisse = findColumnPreferSpecific(columns, SYSTEME_CAISSE_ACTIF_KEYS);
  const colDateProd = findColumnPreferSpecific(columns, DATE_MISE_EN_PROD_KEYS);
  const colStartDate = findColumnPreferSpecific(columns, PROJECT_START_DATE_KEYS);
  const colTotalProjets = findColumn(columns, TOTAL_PROJETS_KEYS);
  const colPays = findColumn(columns, PAYS_COLUMN_KEYS);
  const colUtilisateursActifs =
    columns.find((c) => String(c.id) === SUIVI_UTILISATEURS_ACTIFS_COLUMN_ID) ??
    findColumn(columns, UTILISATEURS_ACTIFS_KEYS);
  const colUtilisateursBruts = findColumn(columns, UTILISATEURS_BRUTS_KEYS);
  const colReferencesMercurial = findColumn(columns, REFERENCES_MERCURIAL_KEYS);
  const colFichesTechniquesActives = findColumn(columns, FICHES_TECHNIQUES_ACTIVES_KEYS);
  const colFichesTechniquesBrut = findColumn(columns, FICHES_TECHNIQUES_BRUT_KEYS);
  const colProduitsGeneriquesBrut = findColumn(columns, PRODUITS_GENERIQUES_BRUT_KEYS);
  const colProduitsGeneriquesActifs = findColumn(columns, PRODUITS_GENERIQUES_ACTIFS_KEYS);
  const colUtilisationMobile = findColumn(columns, UTILISATION_MOBILE_KEYS);

  let sitesActifs = 0;
  let target = 0;
  let cdcDeploye = 0;
  let totalCommandesViaCdc = 0;
  let totalUtilisateursActifs = 0;
  let totalUtilisateursBruts = 0;
  let totalReferencesMercurial = 0;
  let totalFichesTechniquesActives = 0;
  let totalFichesTechniquesBrut = 0;
  let totalProduitsGeneriquesBrut = 0;
  let totalProduitsGeneriquesActifs = 0;
  let totalUtilisationMobile = 0;
  const caisseByLabel = new Map<string, number>();
  let totalProjets = 0;
  const paysCount = new Map<string, number>();
  const countByYear = new Map<number, number>();
  const dureesByYear = new Map<number, number[]>();
  const dureesJours: number[] = [];
  const delaiByClient: { clientName: string; dureeJours: number }[] = [];
  const currentYear = new Date().getFullYear();

  for (const item of items) {
    if (colSitesActifs)
      sitesActifs += getItemNumericValue(item, colSitesActifs.id) || parseNum(getItemValue(item, colSitesActifs.id));
    if (colTarget) target += getItemNumericValue(item, colTarget.id) || parseNum(getItemValue(item, colTarget.id));
    if (colCdc) cdcDeploye += getItemNumericValue(item, colCdc.id) || parseNum(getItemValue(item, colCdc.id));
    if (colCommandesViaCdc)
      totalCommandesViaCdc +=
        getItemNumericValue(item, colCommandesViaCdc.id) || parseNum(getItemValue(item, colCommandesViaCdc.id));
    if (colSystemeCaisse) {
      const label = getItemColumnLabelText(item, colSystemeCaisse.id);
      if (label && isDefinedCaisseLabel(label)) {
        caisseByLabel.set(label, (caisseByLabel.get(label) ?? 0) + 1);
      }
    }
    if (colTotalProjets)
      totalProjets += getItemNumericValue(item, colTotalProjets.id) || parseNum(getItemValue(item, colTotalProjets.id));
    if (colUtilisateursActifs)
      totalUtilisateursActifs +=
        getItemNumericValue(item, colUtilisateursActifs.id) || parseNum(getItemValue(item, colUtilisateursActifs.id));
    if (colUtilisateursBruts)
      totalUtilisateursBruts +=
        getItemNumericValue(item, colUtilisateursBruts.id) || parseNum(getItemValue(item, colUtilisateursBruts.id));
    if (colReferencesMercurial) totalReferencesMercurial += getItemNumericValue(item, colReferencesMercurial.id);
    if (colFichesTechniquesActives) totalFichesTechniquesActives += getItemNumericValue(item, colFichesTechniquesActives.id);
    if (colFichesTechniquesBrut) totalFichesTechniquesBrut += getItemNumericValue(item, colFichesTechniquesBrut.id);
    if (colProduitsGeneriquesBrut)
      totalProduitsGeneriquesBrut +=
        getItemNumericValue(item, colProduitsGeneriquesBrut.id) || parseNum(getItemValue(item, colProduitsGeneriquesBrut.id));
    if (colProduitsGeneriquesActifs)
      totalProduitsGeneriquesActifs +=
        getItemNumericValue(item, colProduitsGeneriquesActifs.id) ||
        parseNum(getItemValue(item, colProduitsGeneriquesActifs.id));
    if (colUtilisationMobile)
      totalUtilisationMobile +=
        getItemNumericValue(item, colUtilisationMobile.id) || parseNum(getItemValue(item, colUtilisationMobile.id));
    if (colPays) {
      const pays = getItemValue(item, colPays.id) || 'Non renseigné';
      paysCount.set(pays, (paysCount.get(pays) ?? 0) + 1);
    }
    if (colDateProd) {
      const prodDate = parseDate(getItemValue(item, colDateProd.id));
      if (prodDate) {
        const y = prodDate.getFullYear();
        countByYear.set(y, (countByYear.get(y) ?? 0) + 1);
        if (colStartDate) {
          const startDate = parseDate(getItemValue(item, colStartDate.id));
          if (startDate && startDate.getTime() <= prodDate.getTime()) {
            const jours = Math.round((prodDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            dureesJours.push(jours);
            delaiByClient.push({ clientName: item.name || 'Sans nom', dureeJours: jours });
            const arr = dureesByYear.get(y) ?? [];
            arr.push(jours);
            dureesByYear.set(y, arr);
          }
        }
      }
    }
  }
  if (totalProjets === 0 && items.length) totalProjets = items.length;
  const byPays = Array.from(paysCount.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const systemeCaisseWordCloud = Array.from(caisseByLabel.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  const projectsByYear = Array.from(countByYear.entries())
    .map(([year, count]) => {
      const joursArr = dureesByYear.get(year) ?? [];
      const dureeMoyenneJours = joursArr.length > 0 ? joursArr.reduce((a, b) => a + b, 0) / joursArr.length : 0;
      return { year, count, dureeMoyenneJours: Math.round(dureeMoyenneJours) };
    })
    .sort((a, b) => b.year - a.year);
  const projetsAnneeEnCours = countByYear.get(currentYear) ?? 0;
  const dureeMoyenneMiseEnProdJours =
    dureesJours.length > 0 ? dureesJours.reduce((a, b) => a + b, 0) / dureesJours.length : 0;
  const dureeMinMiseEnProdJours = dureesJours.length > 0 ? Math.min(...dureesJours) : 0;
  const dureeMaxMiseEnProdJours = dureesJours.length > 0 ? Math.max(...dureesJours) : 0;
  delaiByClient.sort((a, b) => a.dureeJours - b.dureeJours);

  const integrationsEnCours = computeIntegrationsEnCours(items, columns, new Date());
  const agesEnCours = integrationsEnCours.map((r) => r.ageJours);
  const integrationsEnCoursStuckCount = integrationsEnCours.filter((r) => r.stuck).length;
  const integrationsEnCoursAgeMedianJours = medianRounded(agesEnCours);
  const integrationsEnCoursAgeMoyenJours =
    agesEnCours.length > 0 ? Math.round(agesEnCours.reduce((a, b) => a + b, 0) / agesEnCours.length) : 0;

  return {
    sitesActifs,
    target,
    cdcDeploye,
    totalCommandesViaCdc,
    systemeCaisseWordCloud,
    projetsAnneeEnCours,
    projectsByYear,
    dureeMoyenneMiseEnProdJours,
    dureeMinMiseEnProdJours,
    dureeMaxMiseEnProdJours,
    delaiByClient,
    integrationsEnCours,
    integrationsEnCoursStuckCount,
    integrationsEnCoursAgeMedianJours,
    integrationsEnCoursAgeMoyenJours,
    totalProjets,
    byPays,
    totalUtilisateursActifs,
    totalUtilisateursBruts,
    totalReferencesMercurial,
    totalFichesTechniquesActives,
    totalFichesTechniquesBrut,
    totalProduitsGeneriquesBrut,
    totalProduitsGeneriquesActifs,
    totalUtilisationMobile,
  };
}
