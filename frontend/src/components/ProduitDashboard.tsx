import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Package,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  User,
  RefreshCw,
  List,
  MapPin,
  Target,
  Building2,
  Store,
  Folder,
  Globe,
  Clock,
  BarChart3,
  X,
  ChevronDown,
  Info,
  Smartphone,
  FileText,
  Calculator,
  Hourglass,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  LabelList,
} from 'recharts';
import { mondayApi, MondayUser, MondayBoard, MondayColumn, MondayItem, MondayWorkspace } from '../services/api';
import {
  getMondayProduitCache,
  setMondayProduitCache,
  invalidateMondayProduitCache,
  mondayProduitCacheKeys,
  MONDAY_CACHE_TTL_BOOTSTRAP_MS,
  getCachedBoardsList,
  setCachedBoardsList,
  getCachedBoardPayload,
  setCachedBoardPayload,
  type MondayBootstrapCachePayload,
} from '../services/mondayProduitCache';
import {
  CP_REFERENT_KEYS,
  EMPTY_ROADMAP_KPIS,
  SOLUTION_DOC_KEYS,
  STATUS_KEYS,
  calendarDaysInclusiveFromTodayToQuarterEnd,
  calendarQuarterFromDate,
  classifyRoadmapKanbanBucket,
  computeRoadmapKpis,
  findColumnPreferSpecific,
  findRoadmapDateColumn,
  getMondayItemNumericValue,
  getQuarterEndDate,
  isRoadmapNumericKpiValueMissing,
  resolveRoadmapMacroEstimationColumns,
  getRoadmapDateColumnRaw,
  getRoadmapItemStatusLabel,
  isRoadmapSolutionDocValueMissing,
  isRoadmapStatusDone,
  parseRoadmapDateColumnEndDate,
  parseRoadmapDateColumnRange,
  roadmapRangeFullyInQuarterCurrentYear,
  type CalendarQuarter,
  type RoadmapKanbanBucket,
} from '../domain/roadmapAdoriaKpi';

const PAYS_COLUMN_KEYS = ['pays', 'country', 'country code', 'nationalité', 'nationalite'];
const SITES_ACTIFS_KEYS = ['sites actifs', 'sites_actifs', 'active sites', 'nb sites', 'nombre de sites'];
const TARGET_KEYS = ['target', 'objectif', 'cible', 'goal'];
const CDC_KEYS = ['cdc déployé', 'cdc', 'cdc deployé', 'cdc deploye', 'cdc déploye'];
/** Colonne « KPI adoria - Nombre de commandes générées via le CdC » (board Suivi). */
const COMMANDES_VIA_CDC_KEYS = [
  'kpi adoria - nombre de commandes générées via le cdc',
  'kpi adoria -nombre de commandes générées via le cdc',
  'nombre de commandes générées via le cdc',
  'commandes générées via le cdc',
  'commandes generees via le cdc',
];
/** Colonne « Système de caisse actif » (board Suivi) — nuage de mots par fréquence. */
const SYSTEME_CAISSE_ACTIF_KEYS = [
  'système de caisse actif',
  'systeme de caisse actif',
  'système de caisse',
  'systeme de caisse',
  'caisse actif',
];
const DATE_MISE_EN_PROD_KEYS = ['date mise en production', 'mise en production', 'go live', 'lancement production', 'date de lancement en production', 'date lancement production', 'production', 'date prod'];
const PROJECT_START_DATE_KEYS = ['project start date', 'date début projet', 'start date', 'date de début', 'début projet', 'date start', 'date début', 'début'];
const TOTAL_PROJETS_KEYS = ['total projets', 'nb projets', 'nombre projets', 'total', 'projets'];
const UTILISATEURS_ACTIFS_KEYS = [
  "kpi adoria - nbre d'utilisateurs actifs",
  "kpi adoria - nbre d\u2019utilisateurs actifs",
  'kpi adoria - nbre utilisateurs actifs',
  'nbre d\'utilisateurs actifs',
  'utilisateurs actifs',
  'nb utilisateurs actifs',
  'nombre utilisateurs actifs',
  'users actifs',
  'active users',
];
const UTILISATEURS_BRUTS_KEYS = ["kpi adoria - nbre d'utilisateurs bruts", 'utilisateurs bruts', 'nb utilisateurs bruts', 'nombre utilisateurs bruts'];
const REFERENCES_MERCURIAL_KEYS = ['références mercurial', 'references mercurial', 'ref mercurial', 'mercurial', 'nb ref mercurial'];
const FICHES_TECHNIQUES_ACTIVES_KEYS = ['fiches techniques actives', 'fiche technique active', 'ft actives', 'nb ft actives'];
const FICHES_TECHNIQUES_BRUT_KEYS = ['kpi adoria - nombre brut de fiches techniques', 'fiches techniques brut', 'fiches techniques brutes', 'ft brut', 'ft brutes', 'nb ft brut'];
const PRODUITS_GENERIQUES_BRUT_KEYS = ['produits génériques brut', 'total produits génériques brut', 'nb produits génériques brut', 'nombre produits génériques brut', 'produits generiques brut'];
const PRODUITS_GENERIQUES_ACTIFS_KEYS = ['produits génériques actifs', 'produits génériques actifs brut', 'nb produits génériques actifs', 'produits generiques actifs'];
const UTILISATION_MOBILE_KEYS = ['utilisation mobile', 'nb utilisation mobile', 'nombre utilisation mobile', 'total utilisation mobile', 'mobile'];

/** Workspace name for Roadmap Adoria 2026 (exact or partial match). */
const ROADMAP_ADORIA_2026_KEYS = ['roadmap adoria 2026', 'roadmap adoria', 'adoria 2026', 'roadmap 2026', 'roadmap adoria'];
function isRoadmapAdoria2026Workspace(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const n = name.toLowerCase().trim();
  if (n.includes('roadmap') && (n.includes('adoria') || n.includes('2026'))) return true;
  return ROADMAP_ADORIA_2026_KEYS.some((k) => n.includes(k));
}
/** Board ID Roadmap Adoria 2026 (chargé par défaut dans la section KPI Roadmap). */
const ROADMAP_ADORIA_2026_BOARD_ID = '5191064770';
/** Board ID Suivi clients par cp : variable d’env VITE_MONDAY_SUIVI_CLIENT_BOARD_ID ou valeur par défaut. */
const SUIVI_CLIENT_CP_BOARD_ID = (import.meta.env?.VITE_MONDAY_SUIVI_CLIENT_BOARD_ID ?? '475358061').trim() || '475358061';
/** ID de la colonne « KPI adoria - Nbre d'utilisateurs actifs » sur le board Suivi (Monday). */
const SUIVI_UTILISATEURS_ACTIFS_COLUMN_ID = 'numeric_mkxpq040';
/** ID de la colonne CDC déployé sur le board Suivi (Monday). */
const SUIVI_CDC_DEPLOYE_COLUMN_ID = 'numeric_mkwxdthf';

/** Écart relatif symétrique (%) entre deux valeurs Monday ; 0 si les deux sont nuls. */
function mondayMacroEstimateDiffPct(a: number, b: number): number {
  const m = Math.max(0, a);
  const e = Math.max(0, b);
  const denom = Math.max(m, e);
  if (denom <= 0) return 0;
  return (100 * Math.abs(m - e)) / denom;
}

const ROADMAP_MACRO_ESTIMATE_CHART_COLORS = {
  okMacro: '#818cf8',
  okEstimate: '#94a3b8',
  warnMacro: '#f59e0b',
  warnEstimate: '#ef4444',
} as const;

function findColumn(columns: MondayColumn[], keywords: string[]): MondayColumn | null {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/\u2019/g, "'")
      .replace(/\u2018/g, "'");
  return columns.find((c) => keywords.some((k) => normalize(c.title).includes(normalize(k)))) ?? null;
}

function getItemValue(item: MondayItem, columnId: string): string {
  const cv = item.column_values?.find((c) => String(c.id) === String(columnId));
  return (cv?.text ?? cv?.value ?? '').toString().trim();
}

/** Extract numeric value from a Monday column (délègue au domaine Roadmap / Monday). */
const getItemNumericValue = getMondayItemNumericValue;

/** Libellé affiché pour une colonne Monday (texte, statut, liste, etc.). */
function getItemColumnLabelText(item: MondayItem, columnId: string): string {
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
function isDefinedCaisseLabel(label: string): boolean {
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

/** Monday date: value can be JSON {"date":"YYYY-MM-DD"} or "YYYY-MM-DD", text can be "DD/MM/YYYY" or "DD-MM-YYYY". */
function parseDate(value: string): Date | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  let dateStr = trimmed;
  try {
    if (trimmed.startsWith('{')) {
      const o = JSON.parse(trimmed);
      dateStr = o.date ?? o;
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

function parseNum(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/\s/g, '').replace(',', '.').replace(/%/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function computeSuiviKpis(
  items: MondayItem[],
  columns: MondayColumn[]
): {
  sitesActifs: number;
  target: number;
  cdcDeploye: number;
  /** Somme « KPI adoria - Nombre de commandes générées via le CdC ». */
  totalCommandesViaCdc: number;
  /** Libellés « Système de caisse actif » agrégés (fréquence par valeur distincte). */
  systemeCaisseWordCloud: { label: string; count: number }[];
  projetsAnneeEnCours: number;
  projectsByYear: { year: number; count: number; dureeMoyenneJours: number }[];
  dureeMoyenneMiseEnProdJours: number;
  dureeMinMiseEnProdJours: number;
  dureeMaxMiseEnProdJours: number;
  delaiByClient: { clientName: string; dureeJours: number }[];
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
} {
  const colSitesActifs = findColumn(columns, SITES_ACTIFS_KEYS);
  const colTarget = findColumn(columns, TARGET_KEYS);
  const colCdc = columns.find((c) => String(c.id) === SUIVI_CDC_DEPLOYE_COLUMN_ID) ?? findColumn(columns, CDC_KEYS);
  const colCommandesViaCdc = findColumn(columns, COMMANDES_VIA_CDC_KEYS);
  const colSystemeCaisse = findColumnPreferSpecific(columns, SYSTEME_CAISSE_ACTIF_KEYS);
  const colDateProd = findColumn(columns, DATE_MISE_EN_PROD_KEYS);
  const colStartDate = findColumn(columns, PROJECT_START_DATE_KEYS);
  const colTotalProjets = findColumn(columns, TOTAL_PROJETS_KEYS);
  const colPays = findColumn(columns, PAYS_COLUMN_KEYS);
  const colUtilisateursActifs = columns.find((c) => String(c.id) === SUIVI_UTILISATEURS_ACTIFS_COLUMN_ID) ?? findColumn(columns, UTILISATEURS_ACTIFS_KEYS);
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
    if (colSitesActifs) sitesActifs += getItemNumericValue(item, colSitesActifs.id) || parseNum(getItemValue(item, colSitesActifs.id));
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
    if (colTotalProjets) totalProjets += getItemNumericValue(item, colTotalProjets.id) || parseNum(getItemValue(item, colTotalProjets.id));
    if (colUtilisateursActifs) totalUtilisateursActifs += getItemNumericValue(item, colUtilisateursActifs.id) || parseNum(getItemValue(item, colUtilisateursActifs.id));
    if (colUtilisateursBruts) totalUtilisateursBruts += getItemNumericValue(item, colUtilisateursBruts.id) || parseNum(getItemValue(item, colUtilisateursBruts.id));
    if (colReferencesMercurial) totalReferencesMercurial += getItemNumericValue(item, colReferencesMercurial.id);
    if (colFichesTechniquesActives) totalFichesTechniquesActives += getItemNumericValue(item, colFichesTechniquesActives.id);
    if (colFichesTechniquesBrut) totalFichesTechniquesBrut += getItemNumericValue(item, colFichesTechniquesBrut.id);
    if (colProduitsGeneriquesBrut) totalProduitsGeneriquesBrut += getItemNumericValue(item, colProduitsGeneriquesBrut.id) || parseNum(getItemValue(item, colProduitsGeneriquesBrut.id));
    if (colProduitsGeneriquesActifs) totalProduitsGeneriquesActifs += getItemNumericValue(item, colProduitsGeneriquesActifs.id) || parseNum(getItemValue(item, colProduitsGeneriquesActifs.id));
    if (colUtilisationMobile) totalUtilisationMobile += getItemNumericValue(item, colUtilisationMobile.id) || parseNum(getItemValue(item, colUtilisationMobile.id));
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

const DONUT_COLORS = ['#f59e0b', '#06b6d4', '#22c55e', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

/** Courbe > 1 : les libellés les plus fréquents grossissent nettement plus que les rares. */
const WORDCLOUD_SIZE_EXPONENT = 1.45;

function SystemeCaisseWordCloud({
  entries,
  className = '',
  minPx = 9,
  maxPx = 36,
}: {
  entries: { label: string; count: number }[];
  className?: string;
  minPx?: number;
  maxPx?: number;
}) {
  if (entries.length === 0) {
    return <span className="text-surface-500 text-sm">—</span>;
  }
  const counts = entries.map((e) => e.count);
  const maxC = Math.max(...counts);
  const minC = Math.min(...counts);
  const span = maxC - minC || 1;
  const sizeRange = maxPx - minPx;
  return (
    <div className={`flex flex-wrap items-end justify-center gap-x-2 gap-y-1 content-end ${className}`}>
      {entries.map((e, i) => {
        const tLinear = Math.min(1, Math.max(0, (e.count - minC) / span));
        const tAccent = Math.pow(tLinear, WORDCLOUD_SIZE_EXPONENT);
        const fontSize = minPx + tAccent * sizeRange;
        return (
          <span
            key={`${e.label}-${i}`}
            className="font-semibold leading-tight max-w-[min(100%,12rem)] break-words text-center"
            style={{
              fontSize: `${fontSize}px`,
              color: DONUT_COLORS[i % DONUT_COLORS.length],
            }}
            title={`${e.label} : ${e.count}`}
          >
            {e.label}
          </span>
        );
      })}
    </div>
  );
}

function readInitialMondayBootstrap(): MondayBootstrapCachePayload | null {
  if (typeof window === 'undefined') return null;
  return getMondayProduitCache<MondayBootstrapCachePayload>(mondayProduitCacheKeys.bootstrap  );
}

/** Libellés axe Y du diagramme macro/estimation Roadmap : zoom au survol pour lire le nom complet. */
function MacroEstimateYAxisTick({
  x,
  y,
  payload,
  chartRows,
}: {
  x: number;
  y: number;
  payload: { value?: string };
  chartRows: { name: string; summary: string }[];
}) {
  const [hover, setHover] = useState(false);
  const short = String(payload?.value ?? '');
  const row = chartRows.find((r) => r.name === short);
  const fullText = (row?.summary || short).trim() || short;
  const labelW = 272;
  return (
    <foreignObject
      x={x - labelW}
      y={y - 20}
      width={labelW}
      height={44}
      className="overflow-visible"
      style={{ pointerEvents: 'all' }}
    >
      <div
        className={`flex min-h-[20px] items-center justify-end text-right text-slate-400 pr-0.5 origin-right transition-transform duration-200 ease-out will-change-transform ${
          hover ? 'scale-[1.22] text-[13px] leading-snug' : 'text-[10px] leading-tight'
        }`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={fullText}
      >
        <span className="break-words max-w-full">{hover ? fullText : short}</span>
      </div>
    </foreignObject>
  );
}

export function ProduitDashboard() {
  const initialBootstrap = readInitialMondayBootstrap();
  const initialRoadmapWorkspace =
    initialBootstrap?.workspaces?.find((w) => isRoadmapAdoria2026Workspace(w.name)) ?? null;
  const [configured, setConfigured] = useState<boolean | null>(() =>
    initialBootstrap !== null ? initialBootstrap.configured : null
  );
  const [me, setMe] = useState<MondayUser | null>(() => initialBootstrap?.me ?? null);
  const [workspaces, setWorkspaces] = useState<MondayWorkspace[]>(() => initialBootstrap?.workspaces ?? []);
  const [boards, setBoards] = useState<MondayBoard[]>(() =>
    initialBootstrap?.configured ? getCachedBoardsList(undefined) ?? [] : []
  );
  const [loading, setLoading] = useState(() => initialBootstrap === null);
  const [error, setError] = useState<string | null>(null);
  const [suiviBoardId, setSuiviBoardId] = useState(() =>
    initialBootstrap?.configured && SUIVI_CLIENT_CP_BOARD_ID ? SUIVI_CLIENT_CP_BOARD_ID : ''
  );
  const [suiviData, setSuiviData] = useState<{ columns: MondayColumn[]; items: MondayItem[] } | null>(() => {
    if (!initialBootstrap?.configured || !SUIVI_CLIENT_CP_BOARD_ID) return null;
    return getCachedBoardPayload(SUIVI_CLIENT_CP_BOARD_ID, 500);
  });
  const [suiviLoading, setSuiviLoading] = useState(false);
  const [showSystemeCaisseModal, setShowSystemeCaisseModal] = useState(false);
  const [showDelaiModal, setShowDelaiModal] = useState(false);
  const [roadmapBoardId, setRoadmapBoardId] = useState(() =>
    initialBootstrap?.configured ? ROADMAP_ADORIA_2026_BOARD_ID : ''
  );
  const [roadmapData, setRoadmapData] = useState<{ columns: MondayColumn[]; items: MondayItem[] } | null>(() => {
    if (!initialBootstrap?.configured) return null;
    return getCachedBoardPayload(ROADMAP_ADORIA_2026_BOARD_ID, 500);
  });
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapBoards, setRoadmapBoards] = useState<MondayBoard[]>(() =>
    initialBootstrap?.configured && initialRoadmapWorkspace
      ? getCachedBoardsList([initialRoadmapWorkspace.id]) ?? []
      : []
  );
  const [roadmapSectionOpen, setRoadmapSectionOpen] = useState(true);
  /** Bloc « Projets par colonne » : replié par défaut, détail au clic. */
  const [projetsParColonneOpen, setProjetsParColonneOpen] = useState(false);
  /** Diagramme macro chiffrage vs estimation : replié par défaut. */
  const [macroEstimateChartOpen, setMacroEstimateChartOpen] = useState(false);
  /** Modale détail : lignes liées aux encarts CP / solution doc / RAF. */
  const [roadmapIndicatorModal, setRoadmapIndicatorModal] = useState<
    'cp' | 'solutionDoc' | 'macroChiffrage' | 'estimation' | 'raf' | null
  >(null);
  const [suiviSectionOpen, setSuiviSectionOpen] = useState(true);
  const [detailBoard, setDetailBoard] = useState<'roadmap' | 'suivi' | null>(null);
  const [detailKpi, setDetailKpi] = useState<string | null>(null);
  const [roadmapQuarterFilter, setRoadmapQuarterFilter] = useState<'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('all');
  /** Statuts cochés ; vide = pas de filtre sur le statut (tous). */
  const [roadmapStatusSelected, setRoadmapStatusSelected] = useState<string[]>([]);
  /** Incrémenté au rafraîchissement manuel pour forcer le rechargement des boards malgré le cache. */
  const [reloadToken, setReloadToken] = useState(0);

  const roadmapWorkspace = useMemo(
    () => workspaces.find((w) => isRoadmapAdoria2026Workspace(w.name)) ?? null,
    [workspaces]
  );

  const fetchStatusAndMe = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force === true;
    if (!force) {
      const cached = getMondayProduitCache<MondayBootstrapCachePayload>(mondayProduitCacheKeys.bootstrap);
      if (cached) {
        setConfigured(cached.configured);
        setMe(cached.me);
        setWorkspaces(cached.workspaces);
        setLoading(false);
        setError(null);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const [statusRes, meRes] = await Promise.all([
        mondayApi.getStatus(),
        mondayApi.getMe(),
      ]);
      setConfigured(statusRes.configured);
      let nextMe: MondayUser | null = null;
      if (meRes.success && meRes.me) {
        setMe(meRes.me);
        nextMe = meRes.me;
      } else {
        setMe(null);
      }
      let nextWorkspaces: MondayWorkspace[] = [];
      if (statusRes.configured) {
        const workspacesRes = await mondayApi.getWorkspaces();
        if (workspacesRes.success && workspacesRes.workspaces) {
          setWorkspaces(workspacesRes.workspaces);
          nextWorkspaces = workspacesRes.workspaces;
        }
      }
      setMondayProduitCache(
        mondayProduitCacheKeys.bootstrap,
        {
          configured: statusRes.configured,
          me: nextMe,
          workspaces: nextWorkspaces,
        } satisfies MondayBootstrapCachePayload,
        MONDAY_CACHE_TTL_BOOTSTRAP_MS
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion à l’API');
      setConfigured(false);
      setMe(null);
      setBoards([]);
      invalidateMondayProduitCache();
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefreshProduit = useCallback(() => {
    invalidateMondayProduitCache();
    setReloadToken((n) => n + 1);
    void fetchStatusAndMe({ force: true });
  }, [fetchStatusAndMe]);

  useEffect(() => {
    fetchStatusAndMe();
  }, [fetchStatusAndMe]);

  useEffect(() => {
    if (!configured) return;
    const cached = getCachedBoardsList(undefined);
    if (cached) {
      setBoards(cached);
      return;
    }
    const load = async () => {
      try {
        const boardsRes = await mondayApi.getBoards(100, undefined);
        if (boardsRes.success && boardsRes.boards) {
          setBoards(boardsRes.boards);
          setCachedBoardsList(undefined, boardsRes.boards);
        }
      } catch {
        setBoards([]);
      }
    };
    void load();
  }, [configured, reloadToken]);

  useEffect(() => {
    if (!configured || !roadmapWorkspace) {
      setRoadmapBoards([]);
      return;
    }
    const cached = getCachedBoardsList([roadmapWorkspace.id]);
    if (cached) {
      setRoadmapBoards(cached);
      return;
    }
    const load = async () => {
      try {
        const boardsRes = await mondayApi.getBoards(100, [roadmapWorkspace.id]);
        if (boardsRes.success && boardsRes.boards) {
          setRoadmapBoards(boardsRes.boards);
          setCachedBoardsList([roadmapWorkspace.id], boardsRes.boards);
        } else {
          setRoadmapBoards([]);
        }
      } catch {
        setRoadmapBoards([]);
      }
    };
    void load();
  }, [configured, roadmapWorkspace, reloadToken]);

  useEffect(() => {
    if (!suiviBoardId || !configured) {
      setSuiviData(null);
      return;
    }
    const cached = getCachedBoardPayload(suiviBoardId, 500);
    if (cached) {
      setSuiviData(cached);
      setSuiviLoading(false);
      return;
    }
    setSuiviLoading(true);
    setSuiviData(null);
    mondayApi
      .getBoard(suiviBoardId, 500)
      .then((res) => {
        if (res.success && res.columns) {
          const data = { columns: res.columns, items: Array.isArray(res.items) ? res.items : [] };
          setSuiviData(data);
          setCachedBoardPayload(suiviBoardId, 500, data);
        }
      })
      .catch(() => setSuiviData(null))
      .finally(() => setSuiviLoading(false));
  }, [suiviBoardId, configured, reloadToken]);

  useEffect(() => {
    if (!roadmapBoardId || !configured) {
      setRoadmapData(null);
      return;
    }
    const cached = getCachedBoardPayload(roadmapBoardId, 500);
    if (cached) {
      setRoadmapData(cached);
      setRoadmapLoading(false);
      return;
    }
    setRoadmapLoading(true);
    setRoadmapData(null);
    mondayApi
      .getBoard(roadmapBoardId, 500)
      .then((res) => {
        if (res.success && res.columns && res.items) {
          const data = { columns: res.columns, items: res.items };
          setRoadmapData(data);
          setCachedBoardPayload(roadmapBoardId, 500, data);
        }
      })
      .finally(() => setRoadmapLoading(false));
  }, [roadmapBoardId, configured, reloadToken]);

  const suiviKpis = useMemo(() => {
    if (!suiviData) return null;
    return computeSuiviKpis(suiviData.items || [], suiviData.columns || []);
  }, [suiviData]);

  /** Données pour la modale détail KPI (répartition par ligne). */
  const kpiDetailData = useMemo((): { title: string; rows: { name: string; value: number }[] } | { title: string; rows: { name: string; value1: number; value2: number }[] } | null => {
    if (!detailKpi || !suiviData?.columns?.length || !suiviData?.items?.length) return null;
    const columns = suiviData.columns;
    const items = suiviData.items;
    const getCol = (keys: string[]) => findColumn(columns, keys);
    const getColById = (id: string) => columns.find((c) => String(c.id) === id) ?? null;
    const getVal = (item: MondayItem, col: MondayColumn) => getItemNumericValue(item, col.id) || parseNum(getItemValue(item, col.id));

    switch (detailKpi) {
      case 'sitesActifs': {
        const col = getCol(SITES_ACTIFS_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Sites actifs', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'target': {
        const col = getCol(TARGET_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Target sites', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'cdcDeploye': {
        const col = getColById(SUIVI_CDC_DEPLOYE_COLUMN_ID) ?? getCol(CDC_KEYS);
        const colCommandes = getCol(COMMANDES_VIA_CDC_KEYS);
        if (!col) return null;
        const dataRows = items.map((item) => ({
          name: item.name || '—',
          value1: getVal(item, col),
          value2: colCommandes ? getVal(item, colCommandes) : 0,
        }));
        const sorted = dataRows.sort((a, b) => Math.max(b.value1, b.value2) - Math.max(a.value1, a.value2));
        const totalCdc = sorted.reduce((s, r) => s + r.value1, 0);
        const totalCommandes = sorted.reduce((s, r) => s + r.value2, 0);
        return {
          title: 'CDC déployé / commandes via CdC',
          rows: [...sorted, { name: 'Total', value1: totalCdc, value2: totalCommandes }],
        };
      }
      case 'totalProjets': {
        const col = getCol(TOTAL_PROJETS_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Total projets', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'totalUtilisateursActifs': {
        const col = getColById(SUIVI_UTILISATEURS_ACTIFS_COLUMN_ID) ?? getCol(UTILISATEURS_ACTIFS_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Utilisateurs actifs', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'totalUtilisateursBruts': {
        const col = getCol(UTILISATEURS_BRUTS_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Total des utilisateurs', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'totalUtilisationMobile': {
        const col = getCol(UTILISATION_MOBILE_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Utilisation mobile', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'totalReferencesMercurial': {
        const col = getCol(REFERENCES_MERCURIAL_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Références Mercurial', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'fichesTechniques': {
        const colActives = getCol(FICHES_TECHNIQUES_ACTIVES_KEYS);
        const colBrut = getCol(FICHES_TECHNIQUES_BRUT_KEYS);
        if (!colActives && !colBrut) return null;
        const rows = items.map((item) => ({
          name: item.name || '—',
          value1: colActives ? getVal(item, colActives) : 0,
          value2: colBrut ? getVal(item, colBrut) : 0,
        }));
        return { title: 'Fiches techniques (actives / brut)', rows };
      }
      case 'produitsGeneriques': {
        const colBrut = getCol(PRODUITS_GENERIQUES_BRUT_KEYS);
        const colActifs = getCol(PRODUITS_GENERIQUES_ACTIFS_KEYS);
        if (!colBrut && !colActifs) return null;
        const rows = items.map((item) => ({
          name: item.name || '—',
          value1: colBrut ? getVal(item, colBrut) : 0,
          value2: colActifs ? getVal(item, colActifs) : 0,
        }));
        return { title: 'Produits génériques (brut / actifs)', rows };
      }
      default:
        return null;
    }
  }, [detailKpi, suiviData]);

  const roadmapDateColumn = useMemo(
    () => (roadmapData?.columns ? findRoadmapDateColumn(roadmapData.columns) : null),
    [roadmapData?.columns]
  );

  const roadmapStatusColumn = useMemo(
    () => (roadmapData?.columns ? findColumn(roadmapData.columns, STATUS_KEYS) : null),
    [roadmapData?.columns]
  );

  const roadmapStatusOptions = useMemo(() => {
    if (!roadmapData?.items?.length || !roadmapStatusColumn) return [];
    const labels = new Set<string>();
    for (const item of roadmapData.items) {
      labels.add(getRoadmapItemStatusLabel(item, roadmapStatusColumn));
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [roadmapData?.items, roadmapStatusColumn]);

  const roadmapItemsForKpis = useMemo(() => {
    if (!roadmapData?.items?.length) return [];
    let items = roadmapData.items;
    if (roadmapQuarterFilter !== 'all' && roadmapDateColumn) {
      const currentYear = new Date().getFullYear();
      const qTarget: CalendarQuarter =
        roadmapQuarterFilter === 'Q1' ? 1 : roadmapQuarterFilter === 'Q2' ? 2 : roadmapQuarterFilter === 'Q3' ? 3 : 4;
      items = items.filter((item) => {
        const raw = getRoadmapDateColumnRaw(item, roadmapDateColumn.id);
        const { start, end } = parseRoadmapDateColumnRange(raw);
        if (!start || !end) return false;
        return roadmapRangeFullyInQuarterCurrentYear(start, end, qTarget, currentYear);
      });
    }
    if (roadmapStatusSelected.length > 0 && roadmapStatusColumn) {
      const allowed = new Set(roadmapStatusSelected);
      items = items.filter((item) => allowed.has(getRoadmapItemStatusLabel(item, roadmapStatusColumn)));
    }
    return items;
  }, [
    roadmapData?.items,
    roadmapDateColumn,
    roadmapQuarterFilter,
    roadmapStatusColumn,
    roadmapStatusSelected,
  ]);

  const roadmapKpis = useMemo(() => {
    if (!roadmapData?.items?.length) return null;
    if (roadmapItemsForKpis.length === 0) return EMPTY_ROADMAP_KPIS;
    return computeRoadmapKpis(roadmapItemsForKpis, roadmapData.columns);
  }, [roadmapData, roadmapItemsForKpis]);

  /** RAF (trimestre courant = filtre) + projets en retard (2ᵉ date avant aujourd’hui), dans l’encart Ratio CP. */
  const roadmapCpEncartIndicators = useMemo(() => {
    const now = new Date();
    const currentQ = calendarQuarterFromDate(now);
    const year = now.getFullYear();

    let showRaf = false;
    let rafNotDoneCount = 0;
    let daysLeftInQuarter = 0;
    let quarterEndLabel = '';

    if (
      roadmapQuarterFilter !== 'all' &&
      roadmapDateColumn &&
      roadmapStatusColumn
    ) {
      const selectedQ: CalendarQuarter =
        roadmapQuarterFilter === 'Q1' ? 1 : roadmapQuarterFilter === 'Q2' ? 2 : roadmapQuarterFilter === 'Q3' ? 3 : 4;
      if (currentQ === selectedQ) {
        showRaf = true;
        const qEnd = getQuarterEndDate(year, selectedQ);
        quarterEndLabel = qEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        daysLeftInQuarter = calendarDaysInclusiveFromTodayToQuarterEnd(now, qEnd);

        for (const item of roadmapItemsForKpis) {
          const raw = getRoadmapDateColumnRaw(item, roadmapDateColumn.id);
          const { end: endDate } = parseRoadmapDateColumnRange(raw);
          if (!endDate) continue;
          if (endDate.getFullYear() !== year || calendarQuarterFromDate(endDate) !== selectedQ) continue;
          if (isRoadmapStatusDone(getRoadmapItemStatusLabel(item, roadmapStatusColumn))) continue;
          rafNotDoneCount += 1;
        }
      }
    }

    return {
      showRaf,
      rafNotDoneCount,
      daysLeftInQuarter,
      quarterEndLabel,
    };
  }, [roadmapItemsForKpis, roadmapDateColumn, roadmapStatusColumn, roadmapQuarterFilter]);

  /** Lignes filtrées (KPI) sans CP référent valide — pour modale. */
  const roadmapItemsMissingCpDetail = useMemo(() => {
    if (!roadmapData?.columns?.length || !roadmapItemsForKpis.length) return [];
    const colCp = findColumn(roadmapData.columns, CP_REFERENT_KEYS);
    if (!colCp) return [];
    return roadmapItemsForKpis
      .filter((item) => {
        const cpVal = getItemValue(item, colCp.id);
        const hasCp = !!cpVal && cpVal.toLowerCase() !== 'sans nom' && cpVal !== '-';
        return !hasCp;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  }, [roadmapData?.columns, roadmapItemsForKpis]);

  /** Lignes filtrées sans solution doc — pour modale. */
  const roadmapItemsMissingSolDocDetail = useMemo(() => {
    if (!roadmapData?.columns?.length || !roadmapItemsForKpis.length) return [];
    const colSol = findColumn(roadmapData.columns, SOLUTION_DOC_KEYS);
    if (!colSol) return [];
    return roadmapItemsForKpis
      .filter((item) => isRoadmapSolutionDocValueMissing(getItemValue(item, colSol.id)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  }, [roadmapData?.columns, roadmapItemsForKpis]);

  /** Projets comptés dans le RAF (trimestre courant = filtre) — pour modale. */
  const roadmapItemsRafDetail = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const currentQ = calendarQuarterFromDate(now);
    if (roadmapQuarterFilter === 'all' || !roadmapDateColumn || !roadmapStatusColumn) return [];
    const selectedQ: CalendarQuarter =
      roadmapQuarterFilter === 'Q1' ? 1 : roadmapQuarterFilter === 'Q2' ? 2 : roadmapQuarterFilter === 'Q3' ? 3 : 4;
    if (currentQ !== selectedQ) return [];
    const raf: MondayItem[] = [];
    for (const item of roadmapItemsForKpis) {
      const raw = getRoadmapDateColumnRaw(item, roadmapDateColumn.id);
      const { end: endDate } = parseRoadmapDateColumnRange(raw);
      if (!endDate) continue;
      if (endDate.getFullYear() !== year || calendarQuarterFromDate(endDate) !== selectedQ) continue;
      if (isRoadmapStatusDone(getRoadmapItemStatusLabel(item, roadmapStatusColumn))) continue;
      raf.push(item);
    }
    raf.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
    return raf;
  }, [roadmapItemsForKpis, roadmapDateColumn, roadmapStatusColumn, roadmapQuarterFilter]);

  const roadmapColCpForModal = useMemo(
    () => (roadmapData?.columns ? findColumn(roadmapData.columns, CP_REFERENT_KEYS) : null),
    [roadmapData?.columns]
  );
  const roadmapColSolForModal = useMemo(
    () => (roadmapData?.columns ? findColumn(roadmapData.columns, SOLUTION_DOC_KEYS) : null),
    [roadmapData?.columns]
  );

  const roadmapKanbanBuckets = useMemo(() => {
    const now = new Date();
    const buckets: Record<RoadmapKanbanBucket, MondayItem[]> = {
      done: [],
      todo: [],
      encours: [],
      retard: [],
    };
    for (const item of roadmapItemsForKpis) {
      const b = classifyRoadmapKanbanBucket(item, roadmapStatusColumn, roadmapDateColumn, now);
      buckets[b].push(item);
    }
    const sortByName = (a: MondayItem, b: MondayItem) =>
      (a.name || '').localeCompare(b.name || '', 'fr');
    buckets.done.sort(sortByName);
    buckets.todo.sort(sortByName);
    buckets.encours.sort(sortByName);
    buckets.retard.sort(sortByName);
    return buckets;
  }, [roadmapItemsForKpis, roadmapStatusColumn, roadmapDateColumn]);

  /** Colonnes Monday détectées pour le diagramme (valeurs = lignes filtrées comme les KPI Roadmap). */
  const roadmapMacroEstColumns = useMemo(() => {
    if (!roadmapData?.columns?.length) {
      return { macro: null as MondayColumn | null, est: null as MondayColumn | null };
    }
    return resolveRoadmapMacroEstimationColumns(roadmapData.columns);
  }, [roadmapData?.columns]);

  /** Lignes sans macro chiffrage numérique valide (> 0) — modale. */
  const roadmapItemsMissingMacroDetail = useMemo(() => {
    if (!roadmapItemsForKpis.length) return [];
    const col = roadmapMacroEstColumns.macro;
    if (!col) return [];
    return roadmapItemsForKpis
      .filter((item) => isRoadmapNumericKpiValueMissing(item, col))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  }, [roadmapItemsForKpis, roadmapMacroEstColumns.macro]);

  /** Lignes sans estimation numérique valide (> 0) — modale. */
  const roadmapItemsMissingEstimationDetail = useMemo(() => {
    if (!roadmapItemsForKpis.length) return [];
    const col = roadmapMacroEstColumns.est;
    if (!col) return [];
    return roadmapItemsForKpis
      .filter((item) => isRoadmapNumericKpiValueMissing(item, col))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  }, [roadmapItemsForKpis, roadmapMacroEstColumns.est]);

  const roadmapMacroEstimateChartData = useMemo(() => {
    const { macro, est } = roadmapMacroEstColumns;
    if (!macro || !est) return [];
    const out: {
      name: string;
      macroVal: number;
      estimateVal: number;
      diffPct: number;
      diffOver10: boolean;
      itemId: string;
      summary: string;
    }[] = [];
    for (const item of roadmapItemsForKpis) {
      const macroV = getItemNumericValue(item, macro.id);
      const estV = getItemNumericValue(item, est.id);
      if (macroV <= 0 && estV <= 0) continue;
      const diffPct = mondayMacroEstimateDiffPct(macroV, estV);
      const rawName = item.name?.trim() || 'Sans nom';
      const name =
        rawName.length > 28 ? `${rawName.slice(0, 26)}…` : rawName;
      out.push({
        name,
        macroVal: Math.round(macroV * 10) / 10,
        estimateVal: Math.round(estV * 10) / 10,
        diffPct,
        diffOver10: diffPct > 10,
        itemId: item.id,
        summary: item.name || '',
      });
    }
    return out;
  }, [roadmapItemsForKpis, roadmapMacroEstColumns]);

  const roadmapMacroEstimateChartHeight = useMemo(() => {
    const n = roadmapMacroEstimateChartData.length;
    return Math.min(640, Math.max(220, 48 + n * 36));
  }, [roadmapMacroEstimateChartData.length]);

  useEffect(() => {
    setRoadmapQuarterFilter('all');
    setRoadmapStatusSelected([]);
  }, [roadmapBoardId]);

  useEffect(() => {
    setRoadmapStatusSelected((prev) => prev.filter((s) => roadmapStatusOptions.includes(s)));
  }, [roadmapStatusOptions]);

  /** Liste de boards pour la section Roadmap : espace dédié si détecté, sinon tous les boards visibles (ex. "Roadmap Adoria 2026" peut être un board, pas un espace). */
  const boardsForRoadmapSection = roadmapWorkspace ? roadmapBoards : boards;

  /** Charger par défaut le board Roadmap Adoria 2026 (ID 5191064770) dès qu'il est disponible. */
  useEffect(() => {
    if (roadmapBoardId) return;
    const found = boardsForRoadmapSection.some((b) => String(b.id) === ROADMAP_ADORIA_2026_BOARD_ID);
    if (found) setRoadmapBoardId(ROADMAP_ADORIA_2026_BOARD_ID);
  }, [boardsForRoadmapSection, roadmapBoardId]);

  /** Board Suivi : utiliser uniquement l’ID fourni dans le .env (VITE_MONDAY_SUIVI_CLIENT_BOARD_ID). */
  useEffect(() => {
    if (!configured || !SUIVI_CLIENT_CP_BOARD_ID || suiviBoardId) return;
    setSuiviBoardId(SUIVI_CLIENT_CP_BOARD_ID);
  }, [configured, suiviBoardId]);

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-accent-500 animate-spin mb-4" />
        <p className="text-surface-400">Connexion à Monday.com...</p>
      </div>
    );
  }

  if (error || configured === false) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto rounded-2xl border border-surface-700/50 bg-surface-900/50 p-8 text-center">
          <AlertCircle className="w-14 h-14 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-surface-100 mb-2">
            Monday.com non configuré
          </h2>
          <p className="text-surface-400 mb-6">
            {error || 'Ajoutez MONDAY_API_KEY dans le fichier .env du backend pour connecter la page Produit à Monday.com.'}
          </p>
          <button
            onClick={handleRefreshProduit}
            className="px-4 py-2 rounded-xl bg-primary-500/20 text-primary-300 border border-primary-500/40 hover:bg-primary-500/30 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-surface-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-amber-400" />
            </div>
            Produit
          </h1>
          <p className="text-surface-400 mt-1">
            Données produits depuis Monday.com
          </p>
        </div>
        <div className="flex items-center gap-3">
          {me && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-800/80 border border-surface-700/50">
              <User className="w-4 h-4 text-surface-400" />
              <span className="text-sm text-surface-300">{me.name}</span>
              {me.email && (
                <span className="text-xs text-surface-500">({me.email})</span>
              )}
            </div>
          )}
          <button
            onClick={handleRefreshProduit}
            className="p-2 rounded-xl bg-surface-800/80 border border-surface-700/50 hover:bg-surface-700/50 text-surface-400 hover:text-surface-200 transition-colors"
            title="Rafraîchir les données (ignore le cache)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Connected badge */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-green-400/90 text-sm">
          <CheckCircle className="w-4 h-4" />
          Connecté à Monday.com
        </div>
      </div>

      {/* Roadmap Adoria 2026 — KPI par défaut (board fixe), collapse */}
      {configured && (
        <section className="mb-8 rounded-2xl border border-surface-700/50 bg-surface-900/30 overflow-hidden">
          <div className="p-4 border-b border-surface-700/50 bg-surface-800/30 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setRoadmapSectionOpen((o) => !o)}
              className="flex-1 flex flex-wrap items-center gap-4 text-left hover:opacity-90 transition-opacity"
            >
              <ChevronDown
                className={`w-5 h-5 text-surface-400 shrink-0 transition-transform ${roadmapSectionOpen ? '' : '-rotate-90'}`}
                aria-hidden
              />
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-400/80" />
                <h2 className="text-lg font-semibold text-surface-100">
                  {roadmapWorkspace ? roadmapWorkspace.name : 'Roadmap Adoria 2026'}
                </h2>
              </div>
              <span className="text-xs text-surface-500 hidden sm:inline">— Ratio CP référent · Répartition par CP · Statut</span>
            </button>
            <button
              type="button"
              onClick={() => setDetailBoard('roadmap')}
              className="p-2 rounded-lg text-surface-400 hover:text-amber-400 hover:bg-surface-700/50 transition-colors shrink-0"
              title="Détail du board"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
          {roadmapSectionOpen && (
            <>
          {boardsForRoadmapSection.length === 0 && !roadmapLoading && (
            <div className="p-6 text-surface-500 text-sm">
              Aucun board Roadmap disponible. Vérifiez les droits Monday.com ou l’espace « Roadmap Adoria 2026 ».
            </div>
          )}
          {!roadmapLoading && boardsForRoadmapSection.length > 0 && !roadmapBoardId && (
            <div className="p-6 text-surface-400 text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              Chargement du board Roadmap Adoria 2026…
            </div>
          )}
          {roadmapLoading && (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
          )}
          {!roadmapLoading && roadmapKpis && (
            <div className="p-6 space-y-6">
              {(roadmapDateColumn || roadmapStatusColumn) && (
                <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pb-1 border-b border-surface-700/40">
                  {roadmapDateColumn && (
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                      <span className="text-xs font-medium text-surface-500 uppercase tracking-wide shrink-0">
                        Trimestre
                      </span>
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-label="Filtrer les KPI Roadmap par trimestre (date de fin, colonne DATE)"
                      >
                        {(['all', 'Q1', 'Q2', 'Q3', 'Q4'] as const).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setRoadmapQuarterFilter(key)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                              roadmapQuarterFilter === key
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                                : 'bg-surface-800/50 border-surface-700/50 text-surface-400 hover:text-surface-200 hover:border-surface-600/60'
                            }`}
                          >
                            {key === 'all' ? 'Tous' : key}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {roadmapStatusColumn && roadmapStatusOptions.length > 0 && (
                    <div className="flex flex-col gap-2 min-w-0 max-w-full sm:max-w-[36rem]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-surface-500 uppercase tracking-wide shrink-0">
                          Statut
                        </span>
                        <button
                          type="button"
                          onClick={() => setRoadmapStatusSelected([])}
                          className="text-xs text-amber-400/90 hover:text-amber-300 underline-offset-2 hover:underline"
                        >
                          Tous les statuts
                        </button>
                        <span className="text-xs text-surface-500 hidden sm:inline">
                          (aucune case = tout afficher)
                        </span>
                      </div>
                      <div
                        className="flex flex-wrap gap-x-4 gap-y-2 max-h-36 overflow-y-auto rounded-lg border border-surface-700/40 bg-surface-900/40 px-3 py-2"
                        role="group"
                        aria-label="Filtrer par un ou plusieurs statuts"
                      >
                        {roadmapStatusOptions.map((s) => {
                          const checked = roadmapStatusSelected.includes(s);
                          return (
                            <label
                              key={s}
                              className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-surface-200"
                            >
                              <input
                                type="checkbox"
                                className="rounded border-surface-600 bg-surface-900 text-amber-500 focus:ring-amber-500/40"
                                checked={checked}
                                onChange={() => {
                                  setRoadmapStatusSelected((prev) => {
                                    if (prev.includes(s)) return prev.filter((x) => x !== s);
                                    return [...prev, s].sort((a, b) => a.localeCompare(b, 'fr'));
                                  });
                                }}
                              />
                              <span className="truncate max-w-[14rem]" title={s}>
                                {s}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(roadmapQuarterFilter !== 'all' || roadmapStatusSelected.length > 0) &&
                roadmapItemsForKpis.length === 0 &&
                (roadmapData?.items?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                    Aucune ligne ne correspond aux filtres sélectionnés (trimestre : année en cours, plage dans le trimestre ;
                    et/ou statut).
                  </div>
                )}
              {/* Vue projets : 4 colonnes (filtres actifs) — replié par défaut */}
              {roadmapItemsForKpis.length > 0 && (
                <div className="rounded-xl border border-surface-700/50 bg-surface-900/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setProjetsParColonneOpen((o) => !o)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-800/35 transition-colors"
                    aria-expanded={projetsParColonneOpen}
                  >
                    <ChevronDown
                      className={`w-5 h-5 text-surface-400 shrink-0 transition-transform ${projetsParColonneOpen ? '' : '-rotate-90'}`}
                      aria-hidden
                    />
                    <List className="w-4 h-4 text-amber-400 shrink-0" />
                    <h3 className="text-sm font-semibold text-surface-200">Projets par colonne</h3>
                  </button>
                  {projetsParColonneOpen && (
                    <div className="px-4 pb-4 border-t border-surface-700/40">
                      <p className="text-xs text-surface-500 mb-4 mt-3">
                        Vue des lignes visibles avec les filtres actifs — pas un tableau.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        {(
                          [
                            {
                              key: 'done' as const,
                              title: 'Done',
                              subtitle: 'Statuts terminés',
                              className:
                                'border-emerald-500/35 bg-emerald-950/20',
                              titleClass: 'text-emerald-200',
                            },
                            {
                              key: 'todo' as const,
                              title: 'To do',
                              subtitle: 'À faire, backlog…',
                              className: 'border-slate-500/35 bg-slate-900/40',
                              titleClass: 'text-slate-200',
                            },
                            {
                              key: 'encours' as const,
                              title: 'En cours',
                              subtitle: 'Tous les autres statuts',
                              className: 'border-amber-500/35 bg-amber-950/15',
                              titleClass: 'text-amber-200/95',
                            },
                            {
                              key: 'retard' as const,
                              title: 'En retard',
                              subtitle: '2ᵉ date avant aujourd’hui (hors done)',
                              className: 'border-red-500/40 bg-red-950/25',
                              titleClass: 'text-red-200/95',
                            },
                          ] as const
                        ).map((col) => {
                          const items = roadmapKanbanBuckets[col.key];
                          return (
                            <div
                              key={col.key}
                              className={`flex flex-col rounded-xl border p-3 min-h-[8rem] max-h-[min(70vh,28rem)] ${col.className}`}
                            >
                              <div className="shrink-0 pb-2 border-b border-white/5 mb-2">
                                <div className={`text-sm font-semibold ${col.titleClass}`}>{col.title}</div>
                                <div className="text-[11px] text-surface-500 mt-0.5 leading-snug">{col.subtitle}</div>
                                <div className="text-xs text-surface-400 tabular-nums mt-1">{items.length} projet(s)</div>
                              </div>
                              <ul className="space-y-2 overflow-y-auto flex-1 pr-1 text-sm">
                                {items.map((item) => {
                                  const st = roadmapStatusColumn
                                    ? getRoadmapItemStatusLabel(item, roadmapStatusColumn)
                                    : null;
                                  const rawD = roadmapDateColumn
                                    ? getRoadmapDateColumnRaw(item, roadmapDateColumn.id)
                                    : '';
                                  const endD = rawD ? parseRoadmapDateColumnEndDate(rawD) : null;
                                  return (
                                    <li
                                      key={item.id}
                                      className="rounded-lg bg-surface-950/50 border border-surface-800/60 px-2.5 py-2"
                                    >
                                      <div className="text-surface-100 font-medium leading-snug break-words">
                                        {item.name || '—'}
                                      </div>
                                      {col.key === 'retard' && endD && (
                                        <div className="text-[11px] text-red-300/90 tabular-nums mt-1">
                                          Échéance {endD.toLocaleDateString('fr-FR')}
                                        </div>
                                      )}
                                      {col.key === 'encours' && st && (
                                        <div className="text-[11px] text-surface-500 mt-1 truncate" title={st}>
                                          {st}
                                        </div>
                                      )}
                                      {(col.key === 'todo' || col.key === 'done') && st && (
                                        <div className="text-[11px] text-surface-500 mt-1 truncate" title={st}>
                                          {st}
                                        </div>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Ratio global + encarts indicateurs (CP, Solution doc, Macro, Estimation, RAF) */}
              <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 sm:p-6 space-y-6">
                <div className="flex flex-wrap items-end gap-4 justify-between">
                  <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
                    <User className="w-4 h-4 text-amber-400 shrink-0" />
                    KPI roadmap
                  </h3>
                  <div className="text-right">
                    <div className="text-2xl sm:text-3xl font-bold text-surface-100 tabular-nums leading-none">
                      {roadmapKpis.withCpReferent} / {roadmapKpis.totalFeatures}
                    </div>
                    <div className="text-xs sm:text-sm text-surface-500 mt-1">
                      {roadmapKpis.ratioCpReferentPct.toFixed(1)} % des lignes ont un CP référent
                    </div>
                  </div>
                </div>

                <div
                  className={`grid gap-3 justify-items-center sm:justify-items-stretch ${
                    roadmapCpEncartIndicators.showRaf
                      ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
                      : 'grid-cols-2 lg:grid-cols-4'
                  }`}
                >
                  {/* Encarts compacts : CP / Solution doc / Macro / Estimation / RAF */}
                  {/* CP référent manquants */}
                  <button
                    type="button"
                    onClick={() => setRoadmapIndicatorModal('cp')}
                    className={`rounded-lg border flex flex-col w-[7.5rem] h-[7.5rem] sm:w-[8.25rem] sm:h-[8.25rem] mx-auto sm:mx-0 p-[9px] justify-between gap-1 text-left font-inherit cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                      roadmapKpis.missingCpReferent > 0
                        ? 'bg-amber-500/10 border-amber-500/45'
                        : 'bg-green-500/10 border-green-500/45'
                    }`}
                  >
                    <div className="flex items-start gap-1.5 min-h-0">
                      <User
                        className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${
                          roadmapKpis.missingCpReferent > 0 ? 'text-amber-400' : 'text-green-400'
                        }`}
                        aria-hidden
                      />
                      <h4
                        className={`text-[11px] font-semibold uppercase tracking-wide leading-tight ${
                          roadmapKpis.missingCpReferent > 0 ? 'text-amber-100/95' : 'text-green-100/95'
                        }`}
                      >
                        CP référent manquants
                      </h4>
                    </div>
                    <div className="flex flex-1 items-center justify-center min-h-0">
                      <span
                        className={`text-3xl font-bold tabular-nums leading-none ${
                          roadmapKpis.missingCpReferent > 0 ? 'text-amber-50' : 'text-green-50'
                        }`}
                      >
                        {roadmapKpis.missingCpReferent}
                      </span>
                    </div>
                    <p
                      className={`text-[9px] text-center leading-tight line-clamp-2 ${
                        roadmapKpis.missingCpReferent > 0 ? 'text-amber-200/85' : 'text-green-200/85'
                      }`}
                    >
                      {roadmapKpis.missingCpReferent === 0
                        ? 'Toutes les lignes ont un CP référent.'
                        : `Sur ${roadmapKpis.totalFeatures} ligne(s) (filtre).`}
                    </p>
                  </button>

                  {/* Solution doc manquant */}
                  <button
                    type="button"
                    onClick={() => setRoadmapIndicatorModal('solutionDoc')}
                    className={`rounded-lg border flex flex-col w-[7.5rem] h-[7.5rem] sm:w-[8.25rem] sm:h-[8.25rem] mx-auto sm:mx-0 p-[9px] justify-between gap-1 text-left font-inherit cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                      !roadmapKpis.hasSolutionDocColumn
                        ? 'bg-surface-800/80 border-surface-600/60'
                        : roadmapKpis.missingSolutionDoc > 0
                          ? 'bg-amber-500/10 border-amber-500/45'
                          : 'bg-green-500/10 border-green-500/45'
                    }`}
                  >
                    <div className="flex items-start gap-1.5 min-h-0">
                      <FileText
                        className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${
                          !roadmapKpis.hasSolutionDocColumn
                            ? 'text-surface-500'
                            : roadmapKpis.missingSolutionDoc > 0
                              ? 'text-amber-400'
                              : 'text-green-400'
                        }`}
                        aria-hidden
                      />
                      <h4
                        className={`text-[11px] font-semibold uppercase tracking-wide leading-tight ${
                          !roadmapKpis.hasSolutionDocColumn
                            ? 'text-surface-400'
                            : roadmapKpis.missingSolutionDoc > 0
                              ? 'text-amber-100/95'
                              : 'text-green-100/95'
                        }`}
                      >
                        Solution doc manquant
                      </h4>
                    </div>
                    <div className="flex flex-1 items-center justify-center min-h-0">
                      <span
                        className={`text-3xl font-bold tabular-nums leading-none ${
                          !roadmapKpis.hasSolutionDocColumn
                            ? 'text-surface-500'
                            : roadmapKpis.missingSolutionDoc > 0
                              ? 'text-amber-50'
                              : 'text-green-50'
                        }`}
                      >
                        {!roadmapKpis.hasSolutionDocColumn ? '—' : roadmapKpis.missingSolutionDoc}
                      </span>
                    </div>
                    <p
                      className={`text-[9px] text-center leading-tight line-clamp-2 ${
                        !roadmapKpis.hasSolutionDocColumn
                          ? 'text-surface-500'
                          : roadmapKpis.missingSolutionDoc > 0
                            ? 'text-amber-200/85'
                            : 'text-green-200/85'
                      }`}
                    >
                      {!roadmapKpis.hasSolutionDocColumn
                        ? 'Colonne absente.'
                        : roadmapKpis.missingSolutionDoc === 0
                          ? 'Toutes les lignes renseignées.'
                          : 'Vide ou « - ».'}
                    </p>
                  </button>

                  {/* Macro chiffrage manquant */}
                  <button
                    type="button"
                    onClick={() => setRoadmapIndicatorModal('macroChiffrage')}
                    className={`rounded-lg border flex flex-col w-[7.5rem] h-[7.5rem] sm:w-[8.25rem] sm:h-[8.25rem] mx-auto sm:mx-0 p-[9px] justify-between gap-1 text-left font-inherit cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                      !roadmapKpis.hasMacroChiffrageColumn
                        ? 'bg-surface-800/80 border-surface-600/60'
                        : roadmapKpis.missingMacroChiffrage > 0
                          ? 'bg-amber-500/10 border-amber-500/45'
                          : 'bg-green-500/10 border-green-500/45'
                    }`}
                  >
                    <div className="flex items-start gap-1.5 min-h-0">
                      <Calculator
                        className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${
                          !roadmapKpis.hasMacroChiffrageColumn
                            ? 'text-surface-500'
                            : roadmapKpis.missingMacroChiffrage > 0
                              ? 'text-amber-400'
                              : 'text-green-400'
                        }`}
                        aria-hidden
                      />
                      <h4
                        className={`text-[10px] font-semibold uppercase tracking-wide leading-tight line-clamp-2 ${
                          !roadmapKpis.hasMacroChiffrageColumn
                            ? 'text-surface-400'
                            : roadmapKpis.missingMacroChiffrage > 0
                              ? 'text-amber-100/95'
                              : 'text-green-100/95'
                        }`}
                      >
                        Macro chiffrage manquant
                      </h4>
                    </div>
                    <div className="flex flex-1 items-center justify-center min-h-0">
                      <span
                        className={`text-3xl font-bold tabular-nums leading-none ${
                          !roadmapKpis.hasMacroChiffrageColumn
                            ? 'text-surface-500'
                            : roadmapKpis.missingMacroChiffrage > 0
                              ? 'text-amber-50'
                              : 'text-green-50'
                        }`}
                      >
                        {!roadmapKpis.hasMacroChiffrageColumn ? '—' : roadmapKpis.missingMacroChiffrage}
                      </span>
                    </div>
                    <p
                      className={`text-[9px] text-center leading-tight line-clamp-2 ${
                        !roadmapKpis.hasMacroChiffrageColumn
                          ? 'text-surface-500'
                          : roadmapKpis.missingMacroChiffrage > 0
                            ? 'text-amber-200/85'
                            : 'text-green-200/85'
                      }`}
                    >
                      {!roadmapKpis.hasMacroChiffrageColumn
                        ? 'Colonne absente.'
                        : roadmapKpis.missingMacroChiffrage === 0
                          ? 'Toutes les lignes renseignées.'
                          : 'Vide, « - » ou ≤ 0.'}
                    </p>
                  </button>

                  {/* Estimation manquante */}
                  <button
                    type="button"
                    onClick={() => setRoadmapIndicatorModal('estimation')}
                    className={`rounded-lg border flex flex-col w-[7.5rem] h-[7.5rem] sm:w-[8.25rem] sm:h-[8.25rem] mx-auto sm:mx-0 p-[9px] justify-between gap-1 text-left font-inherit cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                      !roadmapKpis.hasEstimationColumn
                        ? 'bg-surface-800/80 border-surface-600/60'
                        : roadmapKpis.missingEstimation > 0
                          ? 'bg-amber-500/10 border-amber-500/45'
                          : 'bg-green-500/10 border-green-500/45'
                    }`}
                  >
                    <div className="flex items-start gap-1.5 min-h-0">
                      <Hourglass
                        className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${
                          !roadmapKpis.hasEstimationColumn
                            ? 'text-surface-500'
                            : roadmapKpis.missingEstimation > 0
                              ? 'text-amber-400'
                              : 'text-green-400'
                        }`}
                        aria-hidden
                      />
                      <h4
                        className={`text-[10px] font-semibold uppercase tracking-wide leading-tight line-clamp-2 ${
                          !roadmapKpis.hasEstimationColumn
                            ? 'text-surface-400'
                            : roadmapKpis.missingEstimation > 0
                              ? 'text-amber-100/95'
                              : 'text-green-100/95'
                        }`}
                      >
                        Estimation manquante
                      </h4>
                    </div>
                    <div className="flex flex-1 items-center justify-center min-h-0">
                      <span
                        className={`text-3xl font-bold tabular-nums leading-none ${
                          !roadmapKpis.hasEstimationColumn
                            ? 'text-surface-500'
                            : roadmapKpis.missingEstimation > 0
                              ? 'text-amber-50'
                              : 'text-green-50'
                        }`}
                      >
                        {!roadmapKpis.hasEstimationColumn ? '—' : roadmapKpis.missingEstimation}
                      </span>
                    </div>
                    <p
                      className={`text-[9px] text-center leading-tight line-clamp-2 ${
                        !roadmapKpis.hasEstimationColumn
                          ? 'text-surface-500'
                          : roadmapKpis.missingEstimation > 0
                            ? 'text-amber-200/85'
                            : 'text-green-200/85'
                      }`}
                    >
                      {!roadmapKpis.hasEstimationColumn
                        ? 'Colonne absente.'
                        : roadmapKpis.missingEstimation === 0
                          ? 'Toutes les lignes renseignées.'
                          : 'Vide, « - » ou ≤ 0.'}
                    </p>
                  </button>

                  {/* RAF sur le trimestre en cours */}
                  {roadmapCpEncartIndicators.showRaf && (
                    <button
                      type="button"
                      onClick={() => setRoadmapIndicatorModal('raf')}
                      className={`rounded-lg border flex flex-col w-[7.5rem] h-[7.5rem] sm:w-[8.25rem] sm:h-[8.25rem] mx-auto sm:mx-0 p-[9px] justify-between gap-1 text-left font-inherit cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                        roadmapCpEncartIndicators.rafNotDoneCount > 0
                          ? 'bg-amber-500/10 border-amber-500/45'
                          : 'bg-green-500/10 border-green-500/45'
                      }`}
                    >
                      <div className="flex items-start gap-1.5 min-h-0">
                        <AlertTriangle
                          className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${
                            roadmapCpEncartIndicators.rafNotDoneCount > 0 ? 'text-amber-400' : 'text-green-400'
                          }`}
                          aria-hidden
                        />
                        <h4
                          className={`text-[9px] font-semibold uppercase tracking-wide leading-tight line-clamp-2 ${
                            roadmapCpEncartIndicators.rafNotDoneCount > 0
                              ? 'text-amber-100/95'
                              : 'text-green-100/95'
                          }`}
                        >
                          RAF sur le trimestre en cours
                        </h4>
                      </div>
                      <div className="flex flex-1 items-center justify-center min-h-0">
                        <span
                          className={`text-3xl font-bold tabular-nums leading-none ${
                            roadmapCpEncartIndicators.rafNotDoneCount > 0 ? 'text-amber-50' : 'text-green-50'
                          }`}
                        >
                          {roadmapCpEncartIndicators.rafNotDoneCount}
                        </span>
                      </div>
                      <p
                        className={`text-[9px] text-center leading-tight line-clamp-3 ${
                          roadmapCpEncartIndicators.rafNotDoneCount > 0 ? 'text-amber-200/85' : 'text-green-200/85'
                        }`}
                        title={`${roadmapQuarterFilter} ${new Date().getFullYear()} · fin ${roadmapCpEncartIndicators.quarterEndLabel}`}
                      >
                        {roadmapQuarterFilter} {new Date().getFullYear()} ·{' '}
                        <span className="tabular-nums font-medium text-surface-200">
                          {roadmapCpEncartIndicators.daysLeftInQuarter}
                        </span>
                        j. rest. · fin {roadmapCpEncartIndicators.quarterEndLabel}
                      </p>
                    </button>
                  )}
                </div>
              </div>

              {/* Macro chiffrage vs estimation — replié par défaut (comme « Projets par colonne ») */}
              {roadmapData && (
                <div className="rounded-xl border border-surface-700/50 bg-surface-900/20 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMacroEstimateChartOpen((o) => !o)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-800/35 transition-colors"
                    aria-expanded={macroEstimateChartOpen}
                  >
                    <ChevronDown
                      className={`w-5 h-5 text-surface-400 shrink-0 transition-transform ${macroEstimateChartOpen ? '' : '-rotate-90'}`}
                      aria-hidden
                    />
                    <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
                    <h3 className="text-sm font-semibold text-surface-200">
                      Macro chiffrage vs estimation (Roadmap Adoria 2026)
                    </h3>
                  </button>
                  {macroEstimateChartOpen && (
                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-surface-700/40">
                      <p className="text-xs text-surface-500 mb-3 mt-3">
                        Valeurs numériques sur les lignes filtrées (trimestre Q1–Q4 / année en cours + statuts), comme les KPI
                        Roadmap au-dessus — pas le détail board brut.
                        {roadmapMacroEstColumns.macro && roadmapMacroEstColumns.est && (
                          <>
                            {' '}
                            Colonnes : « {roadmapMacroEstColumns.macro.title} » · « {roadmapMacroEstColumns.est.title} ».
                          </>
                        )}{' '}
                        Écart relatif &gt; 10 % : barres{' '}
                        <span className="text-amber-400">ambre</span> / <span className="text-red-400">rouge</span> ; sinon{' '}
                        <span className="text-indigo-400">indigo</span> / <span className="text-slate-400">gris</span>.
                      </p>
                      {!roadmapMacroEstColumns.macro || !roadmapMacroEstColumns.est ? (
                        <p className="text-sm text-surface-500">
                          Colonnes introuvables : ajoutez sur Monday une colonne dont le titre contient « macro chiffrage » et
                          une contenant « estimation » (ou « estimate », « chiffrage initial »…).
                        </p>
                      ) : roadmapItemsForKpis.length === 0 && (roadmapData?.items?.length ?? 0) > 0 ? (
                        <p className="text-sm text-amber-200/90">
                          Aucune ligne ne correspond aux filtres trimestre / statut — le diagramme est vide.
                        </p>
                      ) : roadmapMacroEstimateChartData.length === 0 ? (
                        <p className="text-sm text-surface-500">
                          Aucune ligne filtrée avec au moins une valeur renseignée dans ces deux colonnes.
                        </p>
                      ) : (
                        <div className="w-full overflow-visible" style={{ height: roadmapMacroEstimateChartHeight }}>
                          <ResponsiveContainer width="100%" height="100%" className="[&_.recharts-surface]:overflow-visible">
                            <BarChart
                              layout="vertical"
                              data={roadmapMacroEstimateChartData}
                              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                              barCategoryGap="12%"
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.25)" horizontal={false} />
                              <XAxis
                                type="number"
                                tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={276}
                                interval={0}
                                tick={(tickProps: { x: number; y: number; payload: { value?: string } }) => (
                                  <MacroEstimateYAxisTick
                                    x={tickProps.x}
                                    y={tickProps.y}
                                    payload={tickProps.payload}
                                    chartRows={roadmapMacroEstimateChartData.map((d) => ({
                                      name: d.name,
                                      summary: d.summary,
                                    }))}
                                  />
                                )}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'rgba(30, 30, 40, 0.96)',
                                  border: '1px solid rgba(100, 100, 120, 0.35)',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                }}
                                labelStyle={{ color: 'rgb(226, 232, 240)' }}
                                formatter={(value: number, name: string) => [value, name]}
                                labelFormatter={(_label, payload) => {
                                  const p = payload?.[0]?.payload as
                                    | { summary?: string; diffPct?: number }
                                    | undefined;
                                  const sum = p?.summary
                                    ? `${p.summary.slice(0, 120)}${p.summary.length > 120 ? '…' : ''}`
                                    : '';
                                  return sum
                                    ? `${sum} — écart ${(p?.diffPct ?? 0).toFixed(1)} %`
                                    : `Écart ${(p?.diffPct ?? 0).toFixed(1)} %`;
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: 8 }} />
                              <Bar dataKey="macroVal" name="Macro chiffrage">
                                {roadmapMacroEstimateChartData.map((entry, index) => (
                                  <Cell
                                    key={`rm-${entry.itemId}-${index}`}
                                    fill={
                                      entry.diffOver10
                                        ? ROADMAP_MACRO_ESTIMATE_CHART_COLORS.warnMacro
                                        : ROADMAP_MACRO_ESTIMATE_CHART_COLORS.okMacro
                                    }
                                  />
                                ))}
                              </Bar>
                              <Bar dataKey="estimateVal" name="Estimation">
                                {roadmapMacroEstimateChartData.map((entry, index) => (
                                  <Cell
                                    key={`re-${entry.itemId}-${index}`}
                                    fill={
                                      entry.diffOver10
                                        ? ROADMAP_MACRO_ESTIMATE_CHART_COLORS.warnEstimate
                                        : ROADMAP_MACRO_ESTIMATE_CHART_COLORS.okEstimate
                                    }
                                  />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Répartitions CP / PM / Statut — grille responsive (côte à côte sur xl) */}
              {(roadmapKpis.byCpReferent.length > 0 ||
                roadmapKpis.byPm.length > 0 ||
                roadmapKpis.byStatus.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                  {roadmapKpis.byCpReferent.length > 0 && (
                    <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 min-w-0 flex flex-col">
                      <h3 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2 shrink-0">
                        <BarChart3 className="w-4 h-4 text-amber-400" />
                        Répartition par CP référent (projets rattachés)
                      </h3>
                      <div className="h-72 min-h-[16rem] w-full flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={roadmapKpis.byCpReferent}
                            layout="vertical"
                            margin={{ top: 4, right: 16, left: 88, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.3)" />
                            <XAxis type="number" tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }} allowDecimals={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={82}
                              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 10 }}
                              tickFormatter={(v) => (v.length > 18 ? v.slice(0, 16) + '…' : v)}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(30, 30, 40, 0.95)',
                                border: '1px solid rgba(100, 100, 120, 0.3)',
                                borderRadius: '8px',
                                padding: '12px',
                              }}
                              formatter={(value: number) => [`${value} projet(s)`, 'Projets']}
                              labelFormatter={(label) => `CP référent : ${label}`}
                            />
                            <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Projets" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {roadmapKpis.byPm.length > 0 && (
                    <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 min-w-0 flex flex-col">
                      <h3 className="text-sm font-semibold text-surface-200 mb-2 flex items-center gap-2 shrink-0">
                        <BarChart3 className="w-4 h-4 text-cyan-400" />
                        Répartition des projets par PM
                      </h3>
                      <p className="text-xs text-surface-500 mb-3 shrink-0">
                        Total par PM — sans nom : « Non attribués ».
                      </p>
                      <div className="h-72 min-h-[16rem] w-full flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={roadmapKpis.byPm}
                            layout="vertical"
                            margin={{ top: 4, right: 16, left: 88, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.3)" />
                            <XAxis type="number" tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }} allowDecimals={false} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={82}
                              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 10 }}
                              tickFormatter={(v) => (v.length > 18 ? v.slice(0, 16) + '…' : v)}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(30, 30, 40, 0.95)',
                                border: '1px solid rgba(100, 100, 120, 0.3)',
                                borderRadius: '8px',
                                padding: '12px',
                              }}
                              formatter={(value: number) => [`${value} projet(s)`, 'Total']}
                              labelFormatter={(label) => `PM : ${label}`}
                            />
                            <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Projets" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {roadmapKpis.byStatus.length > 0 && (
                    <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 min-w-0 flex flex-col">
                      <h3 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2 shrink-0">
                        <BarChart3 className="w-4 h-4 text-amber-400" />
                        Répartition des projets par statut
                      </h3>
                      <div className="w-full h-[min(22rem,50vh)] min-h-[16rem] flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={roadmapKpis.byStatus.map((d, i) => ({
                              name: d.name,
                              value: d.value,
                              fill: DONUT_COLORS[i % DONUT_COLORS.length],
                              pct:
                                roadmapKpis.totalFeatures > 0
                                  ? ((d.value / roadmapKpis.totalFeatures) * 100).toFixed(1)
                                  : '0',
                            }))}
                            margin={{ top: 24, right: 8, left: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.3)" vertical={false} />
                            <XAxis
                              dataKey="name"
                              type="category"
                              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 10 }}
                              interval={0}
                              tickFormatter={(v) =>
                                typeof v === 'string' && v.length > 14 ? `${v.slice(0, 12)}…` : String(v)
                              }
                              angle={-40}
                              textAnchor="end"
                              height={68}
                            />
                            <YAxis
                              type="number"
                              allowDecimals={false}
                              tick={{ fill: 'rgb(148, 163, 184)', fontSize: 11 }}
                              width={36}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(30, 30, 40, 0.95)',
                                border: '1px solid rgba(100, 100, 120, 0.3)',
                                borderRadius: '8px',
                                padding: '12px',
                              }}
                              formatter={(value: number, _name: string, props) => {
                                const pct = props?.payload?.pct ?? '0';
                                return [`${value} projet(s) (${pct} % du total)`, 'Projets'];
                              }}
                              labelFormatter={(label) => `Statut : ${label}`}
                            />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Projets" isAnimationActive={false}>
                              {roadmapKpis.byStatus.map((_, i) => (
                                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                              ))}
                              <LabelList
                                dataKey="value"
                                position="top"
                                fill="rgb(203, 213, 225)"
                                fontSize={10}
                                formatter={(v: number) =>
                                  roadmapKpis.totalFeatures > 0
                                    ? `${v} (${((v / roadmapKpis.totalFeatures) * 100).toFixed(1)} %)`
                                    : `${v}`
                                }
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {!roadmapLoading && roadmapBoardId && !roadmapKpis && (roadmapData?.items?.length ?? 0) === 0 && (
            <div className="p-6 text-surface-500 text-sm">Aucune donnée dans ce board.</div>
          )}
          {!roadmapLoading && roadmapBoardId && (roadmapData?.items?.length ?? 0) > 0 && !roadmapKpis && (
            <div className="p-6 text-amber-200/90 text-sm">
              Colonnes attendues : « CP RÉFÉRENT » (ou similaire), « SOLUTION DOC » (vide ou « - » = manquant), « Status » / « Statut ».
            </div>
          )}
            </>
          )}
        </section>
      )}

      {/* Suivi clients par cp — KPI (board chargé via VITE_MONDAY_SUIVI_CLIENT_BOARD_ID), collapse */}
      <section className="mb-8 rounded-2xl border border-surface-700/50 bg-surface-900/30 overflow-hidden">
        <div className="p-4 border-b border-surface-700/50 bg-surface-800/30 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSuiviSectionOpen((o) => !o)}
            className="flex-1 flex flex-wrap items-center gap-4 text-left hover:opacity-90 transition-opacity"
          >
            <ChevronDown
              className={`w-5 h-5 text-surface-400 shrink-0 transition-transform ${suiviSectionOpen ? '' : '-rotate-90'}`}
              aria-hidden
            />
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-400/80" />
              <h2 className="text-lg font-semibold text-surface-100">Suivi clients par cp</h2>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setDetailBoard('suivi')}
            className="p-2 rounded-lg text-surface-400 hover:text-amber-400 hover:bg-surface-700/50 transition-colors shrink-0"
            title="Détail du board"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
        {suiviSectionOpen && (
          <>
        {!SUIVI_CLIENT_CP_BOARD_ID && (
          <div className="p-6 text-surface-500 text-sm">
            Définissez <code className="bg-surface-800 px-1 rounded">VITE_MONDAY_SUIVI_CLIENT_BOARD_ID</code> dans le .env avec l’ID du board Monday (ex. 475358061).
          </div>
        )}
        {SUIVI_CLIENT_CP_BOARD_ID && suiviLoading && (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          </div>
        )}
        {SUIVI_CLIENT_CP_BOARD_ID && suiviBoardId && !suiviLoading && !suiviData && (
          <div className="p-6 text-amber-200/90 text-sm">
            Impossible de charger les données du board (ID : {suiviBoardId}). Vérifiez l’ID dans Monday.com et les droits d’accès.
          </div>
        )}
        {SUIVI_CLIENT_CP_BOARD_ID && !suiviLoading && suiviKpis && (
            <div className="p-6 space-y-6">
              <div className="flex flex-wrap items-center gap-4 mb-2">
                <span className="text-sm text-surface-500">
                  {suiviData?.items?.length ?? 0} ligne(s) chargée(s) depuis Monday.com
                </span>
                {suiviData?.items?.length !== undefined && suiviData.items.length > 0 && suiviKpis.sitesActifs === 0 && suiviKpis.target === 0 && suiviKpis.cdcDeploye === 0 && suiviKpis.totalUtilisateursActifs === 0 && (
                  <span className="text-amber-200/90 text-sm">
                    Données chargées mais colonnes non reconnues. Vérifiez que les intitulés des colonnes du board Monday contiennent par ex. « Sites actifs », « Target », « CDC déployé », « Système de caisse actif », « Date mise en production », « Total projets ».
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <button type="button" onClick={() => setDetailKpi('sitesActifs')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium text-surface-500">Sites actifs</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.sitesActifs}</div>
                </button>
                <button type="button" onClick={() => setDetailKpi('target')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-primary-400" />
                    <span className="text-xs font-medium text-surface-500">Target sites</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.target}</div>
                </button>
                <button type="button" onClick={() => setDetailKpi('cdcDeploye')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-medium text-surface-500">CDC déployé</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.cdcDeploye}</span>
                    <span className="text-surface-600 text-lg leading-none" aria-hidden>
                      ·
                    </span>
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalCommandesViaCdc}</div>
                      <div className="text-[10px] text-surface-500 leading-tight">cmd. via CdC</div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSystemeCaisseModal(true)}
                  className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-3 text-left w-full cursor-pointer hover:border-accent-500/40 hover:bg-surface-800/80 transition-colors sm:col-span-2 min-h-[7.5rem] flex flex-col"
                >
                  <div className="flex items-center gap-2 mb-2 shrink-0">
                    <Store className="w-4 h-4 text-accent-400" />
                    <span className="text-xs font-medium text-surface-500">Système de caisse actif</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center min-h-[4rem]">
                    <SystemeCaisseWordCloud entries={suiviKpis.systemeCaisseWordCloud} minPx={7} maxPx={34} />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDelaiModal(true)}
                  className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left w-full cursor-pointer hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium text-surface-500">Délai moy. mise en prod.</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">
                    {suiviKpis.dureeMoyenneMiseEnProdJours > 0
                      ? `${Math.round(suiviKpis.dureeMoyenneMiseEnProdJours)} j`
                      : '—'}
                  </div>
                  {suiviKpis.dureeMoyenneMiseEnProdJours > 0 && (
                    <div className="mt-0.5 space-y-0.5">
                      <div className="text-[10px] text-surface-500">début projet → prod.</div>
                      <div className="text-[10px] text-surface-600">min {suiviKpis.dureeMinMiseEnProdJours} j · max {suiviKpis.dureeMaxMiseEnProdJours} j</div>
                    </div>
                  )}
                </button>
                <button type="button" onClick={() => setDetailKpi('totalProjets')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Folder className="w-4 h-4 text-surface-400" />
                    <span className="text-xs font-medium text-surface-500">Total projets</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalProjets}</div>
                </button>
                <button type="button" onClick={() => setDetailKpi('totalUtilisateursActifs')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-medium text-surface-500">Utilisateurs actifs</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalUtilisateursActifs}</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">somme par site (Nbre d&apos;utilisateurs actifs)</div>
                </button>
                <button type="button" onClick={() => setDetailKpi('totalUtilisateursBruts')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-surface-400" />
                    <span className="text-xs font-medium text-surface-500">Total des utilisateurs</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalUtilisateursBruts}</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">somme par site (Nbre utilisateurs bruts)</div>
                </button>
                <button type="button" onClick={() => setDetailKpi('totalUtilisationMobile')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-violet-400" />
                    <span className="text-xs font-medium text-surface-500">Utilisation mobile</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalUtilisationMobile}</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">nombre total d&apos;utilisation mobile</div>
                </button>
                <button type="button" onClick={() => setDetailKpi('totalReferencesMercurial')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-medium text-surface-500">Références Mercurial</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalReferencesMercurial}</div>
                </button>
                <button type="button" onClick={() => setDetailKpi('fichesTechniques')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 flex flex-col items-center text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1 self-start">
                    <List className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-medium text-surface-500">Fiches techniques</span>
                  </div>
                  <div className="w-full flex-1 min-h-[100px] flex flex-col items-center justify-center">
                    {suiviKpis.totalFichesTechniquesBrut > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={100}>
                          <RadialBarChart
                            cx="50%"
                            cy="55%"
                            innerRadius="50%"
                            outerRadius="90%"
                            barSize={8}
                            data={[
                              { name: 'total', value: 100, fill: '#475569' },
                              {
                                name: 'actives',
                                value: Math.min(100, (suiviKpis.totalFichesTechniquesActives / suiviKpis.totalFichesTechniquesBrut) * 100),
                                fill: '#4ade80',
                              },
                            ]}
                            startAngle={180}
                            endAngle={0}
                          >
                            <RadialBar background dataKey="value" cornerRadius={4} />
                          </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="text-surface-100 text-sm font-bold tabular-nums mt-0.5">
                          {suiviKpis.totalFichesTechniquesActives} / {suiviKpis.totalFichesTechniquesBrut}
                        </div>
                        <div className="text-[10px] text-surface-500">actives / brut</div>
                      </>
                    ) : (
                      <div className="text-surface-500 text-sm">—</div>
                    )}
                  </div>
                </button>
              </div>
              {/* Diagramme comparatif Produits génériques brut vs actifs */}
              {(suiviKpis.totalProduitsGeneriquesBrut > 0 || suiviKpis.totalProduitsGeneriquesActifs > 0) && (
                <button
                  type="button"
                  onClick={() => setDetailKpi('produitsGeneriques')}
                  className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 w-full text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer"
                >
                  <h3 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    Produits génériques : brut vs actifs
                  </h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Total brut', value: suiviKpis.totalProduitsGeneriquesBrut, fill: '#64748b' },
                          { name: 'Actifs', value: suiviKpis.totalProduitsGeneriquesActifs, fill: '#22c55e' },
                        ]}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 80, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.3)" />
                        <XAxis type="number" tick={{ fill: 'rgb(148, 163, 184)', fontSize: 12 }} allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={75}
                          tick={{ fill: 'rgb(148, 163, 184)', fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(30, 30, 40, 0.95)',
                            border: '1px solid rgba(100, 100, 120, 0.3)',
                            borderRadius: '8px',
                            padding: '12px',
                          }}
                          formatter={(value: number) => [value, '']}
                          labelFormatter={(label) => label}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name="">
                          <Cell fill="#64748b" />
                          <Cell fill="#22c55e" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-surface-500">
                    <span>Brut : {suiviKpis.totalProduitsGeneriquesBrut}</span>
                    <span>Actifs : {suiviKpis.totalProduitsGeneriquesActifs}</span>
                  </div>
                </button>
              )}
              {suiviKpis.projectsByYear.length > 0 && (
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <h3 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-400" />
                    Mises en production par année
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={suiviKpis.projectsByYear.map(({ year, count, dureeMoyenneJours }) => ({
                          year: String(year),
                          count,
                          dureeMoyenneJours: dureeMoyenneJours || undefined,
                        }))}
                        margin={{ top: 8, right: 48, left: 0, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,120,0.3)" />
                        <XAxis
                          dataKey="year"
                          tick={{ fill: 'rgb(148, 163, 184)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(100,100,120,0.5)' }}
                          tickLine={{ stroke: 'rgba(100,100,120,0.3)' }}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fill: 'rgb(148, 163, 184)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(100,100,120,0.5)' }}
                          tickLine={{ stroke: 'rgba(100,100,120,0.3)' }}
                          allowDecimals={false}
                          label={{ value: 'Nb mises en prod.', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 11 } }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fill: 'rgb(100, 116, 139)', fontSize: 12 }}
                          axisLine={{ stroke: 'rgba(100,100,120,0.5)' }}
                          tickLine={{ stroke: 'rgba(100,100,120,0.3)' }}
                          allowDecimals={false}
                          label={{ value: 'Délai moy. (j)', angle: 90, position: 'insideRight', style: { fill: '#94a3b8', fontSize: 11 } }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(30, 30, 40, 0.95)',
                            border: '1px solid rgba(100, 100, 120, 0.3)',
                            borderRadius: '8px',
                            padding: '12px',
                          }}
                          labelFormatter={(label) => `Année ${label}`}
                          formatter={(value: number, name: string) => {
                            if (name === 'count') return [`${value} mise(s) en prod.`, 'Nombre'];
                            return [`${value} jours`, 'Délai moy. mise en prod.'];
                          }}
                        />
                        <Legend
                          formatter={(value) => (
                            <span className="text-surface-300 text-sm">
                              {value === 'count' ? 'Nombre de mises en prod.' : 'Délai moy. (jours)'}
                            </span>
                          )}
                        />
                        <Bar yAxisId="left" dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} name="count" />
                        <Bar
                          yAxisId="right"
                          dataKey="dureeMoyenneJours"
                          fill="#06b6d4"
                          radius={[4, 4, 0, 0]}
                          name="dureeMoyenneJours"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {suiviKpis.byPays.length > 0 && (
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <h3 className="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-amber-400" />
                    Répartition par pays
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={suiviKpis.byPays.map((d, i) => ({ ...d, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {suiviKpis.byPays.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(30, 30, 40, 0.95)',
                            border: '1px solid rgba(100, 100, 120, 0.3)',
                            borderRadius: '8px',
                            padding: '12px',
                          }}
                          formatter={(value: number, name: string) => [`${value} site(s)`, name]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          formatter={(value) => <span className="text-surface-300 text-sm">{value}</span>}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {suiviKpis.byPays.length === 0 && (
                <p className="text-surface-500 text-sm">
                  Aucune colonne « Pays » / « Country » trouvée pour la répartition par pays.
                </p>
              )}
            </div>
          )}
          </>
        )}
        </section>

      {/* Modale — détail lignes encarts Roadmap (CP / solution doc / macro / estimation / RAF) */}
      {roadmapIndicatorModal && roadmapData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setRoadmapIndicatorModal(null)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface-700">
              <h3 className="text-lg font-semibold text-surface-100 pr-4">
                {roadmapIndicatorModal === 'cp' && 'CP référent manquant — détail des lignes'}
                {roadmapIndicatorModal === 'solutionDoc' && 'Solution doc manquant — détail des lignes'}
                {roadmapIndicatorModal === 'macroChiffrage' && 'Macro chiffrage manquant — détail des lignes'}
                {roadmapIndicatorModal === 'estimation' && 'Estimation manquante — détail des lignes'}
                {roadmapIndicatorModal === 'raf' && 'RAF (trimestre en cours) — projets non terminés'}
              </h3>
              <button
                type="button"
                onClick={() => setRoadmapIndicatorModal(null)}
                className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="px-4 pt-3 text-xs text-surface-500">
              Projets / lignes correspondant à l&apos;indicateur, avec les mêmes filtres KPI (trimestre / statut) que la
              section Roadmap.
            </p>
            <div className="p-4 overflow-auto flex-1 min-h-0">
              {roadmapIndicatorModal === 'cp' && !roadmapColCpForModal && (
                <p className="text-sm text-surface-500">
                  Colonne « CP RÉFÉRENT » (ou similaire) introuvable sur ce board.
                </p>
              )}
              {roadmapIndicatorModal === 'solutionDoc' && !roadmapColSolForModal && (
                <p className="text-sm text-surface-500">Colonne « SOLUTION DOC » introuvable sur ce board.</p>
              )}
              {roadmapIndicatorModal === 'macroChiffrage' && !roadmapMacroEstColumns.macro && (
                <p className="text-sm text-surface-500">
                  Colonne « macro chiffrage » (titre contenant ce libellé) introuvable sur ce board.
                </p>
              )}
              {roadmapIndicatorModal === 'estimation' && !roadmapMacroEstColumns.est && (
                <p className="text-sm text-surface-500">
                  Colonne « estimation » (titre contenant estimation, estimate, chiffrage initial…) introuvable sur ce board.
                </p>
              )}
              {roadmapIndicatorModal === 'cp' && roadmapColCpForModal && roadmapItemsMissingCpDetail.length === 0 && (
                <p className="text-sm text-surface-500">Aucune ligne sans CP référent sur les filtres actuels.</p>
              )}
              {roadmapIndicatorModal === 'solutionDoc' && roadmapColSolForModal && roadmapItemsMissingSolDocDetail.length === 0 && (
                <p className="text-sm text-surface-500">Toutes les lignes filtrées ont une solution doc renseignée.</p>
              )}
              {roadmapIndicatorModal === 'raf' && roadmapItemsRafDetail.length === 0 && (
                <p className="text-sm text-surface-500">
                  Aucun projet à boucler sur ce périmètre (filtre trimestre = trimestre calendaire en cours, échéance dans
                  le trimestre, statut non terminé).
                </p>
              )}
              {roadmapIndicatorModal === 'macroChiffrage' &&
                roadmapMacroEstColumns.macro &&
                roadmapItemsMissingMacroDetail.length === 0 && (
                  <p className="text-sm text-surface-500">
                    Toutes les lignes filtrées ont un macro chiffrage numérique &gt; 0.
                  </p>
                )}
              {roadmapIndicatorModal === 'estimation' &&
                roadmapMacroEstColumns.est &&
                roadmapItemsMissingEstimationDetail.length === 0 && (
                  <p className="text-sm text-surface-500">
                    Toutes les lignes filtrées ont une estimation numérique &gt; 0.
                  </p>
                )}
              {roadmapIndicatorModal === 'cp' && roadmapColCpForModal && roadmapItemsMissingCpDetail.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-700/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">CP référent</th>
                        {roadmapStatusColumn && (
                          <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Statut</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {roadmapItemsMissingCpDetail.map((item) => (
                        <tr key={item.id} className="border-b border-surface-700/30">
                          <td className="py-2 px-3 text-surface-200 align-top">{item.name || '—'}</td>
                          <td
                            className="py-2 px-3 text-surface-400 align-top max-w-[16rem]"
                            title={getItemValue(item, roadmapColCpForModal.id)}
                          >
                            {getItemValue(item, roadmapColCpForModal.id) || '—'}
                          </td>
                          {roadmapStatusColumn && (
                            <td className="py-2 px-3 text-surface-400 align-top">
                              {getRoadmapItemStatusLabel(item, roadmapStatusColumn)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {roadmapIndicatorModal === 'solutionDoc' && roadmapColSolForModal && roadmapItemsMissingSolDocDetail.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-700/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Solution doc</th>
                        {roadmapStatusColumn && (
                          <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Statut</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {roadmapItemsMissingSolDocDetail.map((item) => (
                        <tr key={item.id} className="border-b border-surface-700/30">
                          <td className="py-2 px-3 text-surface-200 align-top">{item.name || '—'}</td>
                          <td
                            className="py-2 px-3 text-surface-400 align-top max-w-[16rem]"
                            title={getItemValue(item, roadmapColSolForModal.id)}
                          >
                            {getItemValue(item, roadmapColSolForModal.id) || '—'}
                          </td>
                          {roadmapStatusColumn && (
                            <td className="py-2 px-3 text-surface-400 align-top">
                              {getRoadmapItemStatusLabel(item, roadmapStatusColumn)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {roadmapIndicatorModal === 'macroChiffrage' &&
                roadmapMacroEstColumns.macro &&
                roadmapItemsMissingMacroDetail.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-700/50">
                          <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                          <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">
                            {roadmapMacroEstColumns.macro.title}
                          </th>
                          {roadmapStatusColumn && (
                            <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Statut</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {roadmapItemsMissingMacroDetail.map((item) => {
                          const display = getItemColumnLabelText(item, roadmapMacroEstColumns.macro!.id);
                          return (
                            <tr key={item.id} className="border-b border-surface-700/30">
                              <td className="py-2 px-3 text-surface-200 align-top">{item.name || '—'}</td>
                              <td
                                className="py-2 px-3 text-surface-400 align-top max-w-[16rem] tabular-nums"
                                title={display || '—'}
                              >
                                {display || '—'}
                              </td>
                              {roadmapStatusColumn && (
                                <td className="py-2 px-3 text-surface-400 align-top">
                                  {getRoadmapItemStatusLabel(item, roadmapStatusColumn)}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              {roadmapIndicatorModal === 'estimation' &&
                roadmapMacroEstColumns.est &&
                roadmapItemsMissingEstimationDetail.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-700/50">
                          <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                          <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">
                            {roadmapMacroEstColumns.est.title}
                          </th>
                          {roadmapStatusColumn && (
                            <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Statut</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {roadmapItemsMissingEstimationDetail.map((item) => {
                          const display = getItemColumnLabelText(item, roadmapMacroEstColumns.est!.id);
                          return (
                            <tr key={item.id} className="border-b border-surface-700/30">
                              <td className="py-2 px-3 text-surface-200 align-top">{item.name || '—'}</td>
                              <td
                                className="py-2 px-3 text-surface-400 align-top max-w-[16rem] tabular-nums"
                                title={display || '—'}
                              >
                                {display || '—'}
                              </td>
                              {roadmapStatusColumn && (
                                <td className="py-2 px-3 text-surface-400 align-top">
                                  {getRoadmapItemStatusLabel(item, roadmapStatusColumn)}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              {roadmapIndicatorModal === 'raf' && roadmapItemsRafDetail.length > 0 && roadmapDateColumn && roadmapStatusColumn && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-700/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">
                          Fin (colonne date)
                        </th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roadmapItemsRafDetail.map((item) => {
                        const raw = getRoadmapDateColumnRaw(item, roadmapDateColumn.id);
                        const endD = parseRoadmapDateColumnEndDate(raw);
                        return (
                          <tr key={item.id} className="border-b border-surface-700/30">
                            <td className="py-2 px-3 text-surface-200 align-top">{item.name || '—'}</td>
                            <td className="py-2 px-3 text-surface-400 tabular-nums align-top">
                              {endD ? endD.toLocaleDateString('fr-FR') : '—'}
                            </td>
                            <td className="py-2 px-3 text-surface-400 align-top">
                              {getRoadmapItemStatusLabel(item, roadmapStatusColumn)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Détail KPI — répartition par ligne/site */}
      {detailKpi && kpiDetailData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailKpi(null)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface-700">
              <h3 className="text-lg font-semibold text-surface-100">Détail — {kpiDetailData.title}</h3>
              <button
                type="button"
                onClick={() => setDetailKpi(null)}
                className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {kpiDetailData.rows.length === 0 ? (
                <p className="text-surface-500 text-sm">Aucune donnée.</p>
              ) : 'value1' in kpiDetailData.rows[0] ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-700/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-surface-500 uppercase">Col. 1</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-surface-500 uppercase">Col. 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(kpiDetailData.rows as { name: string; value1: number; value2: number }[])
                        .sort((a, b) => Math.max(b.value1, b.value2) - Math.max(a.value1, a.value2))
                        .map((row, i) => (
                          <tr key={i} className="border-b border-surface-700/30">
                            <td className="py-2 px-3 text-surface-200">{row.name}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-surface-100">{row.value1}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-surface-100">{row.value2}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-700/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-surface-500 uppercase">Valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(kpiDetailData.rows as { name: string; value: number }[]).map((row, i) => (
                        <tr key={i} className="border-b border-surface-700/30">
                          <td className="py-2 px-3 text-surface-200">{row.name}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-surface-100">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Détail du board (Roadmap ou Suivi) */}
      {detailBoard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailBoard(null)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {detailBoard === 'roadmap' && (
              <>
                <div className="flex items-center justify-between p-4 border-b border-surface-700">
                  <div className="flex items-center gap-2">
                    <Info className="w-5 h-5 text-amber-400" />
                    <h3 className="text-lg font-semibold text-surface-100">
                      Détail du board — {roadmapWorkspace ? roadmapWorkspace.name : 'Roadmap Adoria 2026'}
                    </h3>
                    {roadmapBoardId && (
                      <span className="text-sm text-surface-500">ID : {roadmapBoardId}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailBoard(null)}
                    className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 overflow-auto flex-1">
                  {!roadmapData ? (
                    <p className="text-surface-500 text-sm">Aucune donnée chargée.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-sm">
                        <thead>
                          <tr className="border-b border-surface-700/50">
                            <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                            {roadmapData.columns.map((col) => (
                              <th key={col.id} className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">{col.title}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {roadmapData.items.map((item) => (
                            <tr key={item.id} className="border-b border-surface-700/30 hover:bg-surface-800/30">
                              <td className="py-2 px-3 text-surface-200 font-medium">{item.name}</td>
                              {roadmapData.columns.map((col) => {
                                const cv = item.column_values?.find((c) => c.id === col.id);
                                const text = (cv?.text ?? cv?.value ?? '—').toString().trim() || '—';
                                return (
                                  <td key={col.id} className="py-2 px-3 text-surface-400 truncate max-w-[200px]" title={text}>{text}</td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-surface-500 text-xs mt-2">{roadmapData.items.length} ligne(s)</p>
                    </div>
                  )}
                </div>
              </>
            )}
            {detailBoard === 'suivi' && (
              <>
                <div className="flex items-center justify-between p-4 border-b border-surface-700">
                  <div className="flex items-center gap-2">
                    <Info className="w-5 h-5 text-amber-400" />
                    <h3 className="text-lg font-semibold text-surface-100">Détail du board — Suivi clients par cp</h3>
                    {suiviBoardId && (
                      <span className="text-sm text-surface-500">ID : {suiviBoardId}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailBoard(null)}
                    className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 overflow-auto flex-1">
                  {!suiviData ? (
                    <p className="text-surface-500 text-sm">Aucune donnée chargée.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] text-sm">
                        <thead>
                          <tr className="border-b border-surface-700/50">
                            <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                            {suiviData.columns.map((col) => (
                              <th key={col.id} className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">{col.title}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {suiviData.items.map((item) => (
                            <tr key={item.id} className="border-b border-surface-700/30 hover:bg-surface-800/30">
                              <td className="py-2 px-3 text-surface-200 font-medium">{item.name}</td>
                              {suiviData.columns.map((col) => {
                                const cv = item.column_values?.find((c) => c.id === col.id);
                                const text = (cv?.text ?? cv?.value ?? '—').toString().trim() || '—';
                                return (
                                  <td key={col.id} className="py-2 px-3 text-surface-400 truncate max-w-[200px]" title={text}>{text}</td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-surface-500 text-xs mt-2">{suiviData.items.length} ligne(s)</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Délai mise en prod par client */}
      {showDelaiModal && suiviKpis && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowDelaiModal(false)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface-700">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-semibold text-surface-100">Délai mise en prod. par client</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDelaiModal(false)}
                className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {suiviKpis.delaiByClient.length === 0 ? (
                <p className="text-surface-500 text-sm">Aucun délai calculé (dates début projet et mise en prod. requises).</p>
              ) : (
                <ul className="space-y-2">
                  {suiviKpis.delaiByClient.map((row, i) => (
                    <li
                      key={`${row.clientName}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-surface-800/50 border border-surface-700/50 px-3 py-2"
                    >
                      <span className="text-surface-200 truncate flex-1 mr-2">{row.clientName}</span>
                      <span className="text-amber-400 font-semibold tabular-nums shrink-0">{row.dureeJours} j</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Système de caisse actif — nuage + détail des effectifs */}
      {showSystemeCaisseModal && suiviKpis && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSystemeCaisseModal(false)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface-700">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-accent-400" />
                <h3 className="text-lg font-semibold text-surface-100">Système de caisse actif</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSystemeCaisseModal(false)}
                className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-6">
              {suiviKpis.systemeCaisseWordCloud.length === 0 ? (
                <div className="text-surface-500 text-sm space-y-2">
                  <p>Aucune valeur renseignée pour les systèmes de caisse.</p>
                  <p className="text-surface-600 text-xs">
                    Vérifiez que le board « Suivi clients par cp » contient une colonne « Système de caisse actif » et que des libellés sont renseignés par ligne.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-surface-800/40 border border-surface-700/50 p-6 min-h-[12rem] flex items-center justify-center">
                    <SystemeCaisseWordCloud entries={suiviKpis.systemeCaisseWordCloud} minPx={11} maxPx={58} />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-surface-400 mb-2">Effectif par système</h4>
                    <ul className="space-y-2">
                      {suiviKpis.systemeCaisseWordCloud.map((row, i) => (
                        <li
                          key={`${row.label}-${i}`}
                          className="flex items-center justify-between rounded-lg bg-surface-800/50 border border-surface-700/50 px-3 py-2 text-sm"
                        >
                          <span className="text-surface-200 mr-2 break-words">{row.label}</span>
                          <span
                            className="shrink-0 font-semibold tabular-nums"
                            style={{ color: DONUT_COLORS[i % DONUT_COLORS.length] }}
                          >
                            {row.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
