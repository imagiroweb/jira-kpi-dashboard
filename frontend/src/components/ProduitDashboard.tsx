import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  Save,
  Frame,
  LayoutTemplate,
  Receipt,
  UserCheck,
  ShieldCheck,
  ClipboardCheck,
  Megaphone,
  Users,
  Link2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  CDC_KEYS,
  COMMANDES_VIA_CDC_KEYS,
  FICHES_TECHNIQUES_ACTIVES_KEYS,
  FICHES_TECHNIQUES_BRUT_KEYS,
  PRODUITS_GENERIQUES_ACTIFS_KEYS,
  PRODUITS_GENERIQUES_BRUT_KEYS,
  REFERENCES_MERCURIAL_KEYS,
  SITES_ACTIFS_KEYS,
  SUIVI_CDC_DEPLOYE_COLUMN_ID,
  SUIVI_UTILISATEURS_ACTIFS_COLUMN_ID,
  TARGET_KEYS,
  TOTAL_PROJETS_KEYS,
  UTILISATEURS_ACTIFS_KEYS,
  UTILISATEURS_BRUTS_KEYS,
  UTILISATION_MOBILE_KEYS,
  computeSuiviKpis,
  getItemColumnLabelText,
  INTEGRATION_EN_COURS_TONE_UI,
  integrationEnCoursAgeTone,
  buildIntegrationTimelineEvents,
  type IntegrationEnCours,
  isRoadmapAdoria2026Workspace,
  mondayMacroEstimateDiffPct,
  parseNum,
} from '../domain/produitSuiviKpi';
import {
  EMPTY_ROADMAP_KPIS,
  STATUS_KEYS,
  TEAM_KEYS,
  buildRoadmapTeamFilterOptions,
  calendarDaysInclusiveFromTodayToQuarterEnd,
  calendarQuarterFromDate,
  classifyRoadmapKanbanBucket,
  computeRoadmapKpis,
  computeRoadmapMissingIndicators,
  findColumnByKeywords as findColumn,
  findRoadmapDateColumn,
  findRoadmapQuarterStatusColumn,
  getItemValue,
  getMondayItemNumericValue,
  getQuarterEndDate,
  resolveRoadmapMacroEstimationColumns,
  getRoadmapDateColumnRaw,
  getRoadmapItemStatusLabel,
  getRoadmapItemTeamLabel,
  isRoadmapStatusDone,
  parseRoadmapDateColumnEndDate,
  parseRoadmapDateColumnRange,
  roadmapQuarterStatusMatchesQuarter,
  roadmapRangeFullyInQuarterCurrentYear,
  type CalendarQuarter,
  type RoadmapKanbanBucket,
  type RoadmapMissingIndicator,
  type RoadmapMissingIndicatorId,
} from '../domain/roadmapAdoriaKpi';
import {
  authApi,
  type RoadmapAdoria2026DefaultFilters,
  type RoadmapAdoriaQuarterFilter,
} from '../services/authApi';
import { useSocketOptional } from '../hooks/useSocketContext';

/** Board ID Roadmap Adoria 2026 (chargé par défaut dans la section KPI Roadmap). */
const ROADMAP_ADORIA_2026_BOARD_ID = '5191064770';
/** Board ID Suivi clients par cp : variable d’env VITE_MONDAY_SUIVI_CLIENT_BOARD_ID ou valeur par défaut. */
const SUIVI_CLIENT_CP_BOARD_ID = (import.meta.env?.VITE_MONDAY_SUIVI_CLIENT_BOARD_ID ?? '475358061').trim() || '475358061';

const ROADMAP_MACRO_ESTIMATE_CHART_COLORS = {
  okMacro: '#818cf8',
  okEstimate: '#94a3b8',
  warnMacro: '#f59e0b',
  warnEstimate: '#ef4444',
} as const;

/** Extract numeric value from a Monday column (délègue au domaine Roadmap / Monday). */
const getItemNumericValue = getMondayItemNumericValue;

const DONUT_COLORS = ['#f59e0b', '#06b6d4', '#22c55e', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

function formatYmdFr(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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

/** Icône par encart « Sans … » de la Roadmap. */
const ROADMAP_MISSING_INDICATOR_ICONS: Record<RoadmapMissingIndicatorId, LucideIcon> = {
  cp: User,
  solutionDoc: FileText,
  wireframe: Frame,
  maquette: LayoutTemplate,
  macroChiffrage: Calculator,
  estimation: Hourglass,
  devis: Receipt,
  validationClient: UserCheck,
  validationClients: ShieldCheck,
  validationOperationnelle: ClipboardCheck,
  validationMarketing: Megaphone,
  clientsPilotes: Users,
  epic: Link2,
};

/** Palettes des encarts compacts : colonne absente / lignes manquantes / tout renseigné. */
const ROADMAP_TILE_TONES = {
  muted: {
    box: 'bg-surface-800/80 border-surface-600/60',
    icon: 'text-surface-500',
    title: 'text-surface-400',
    value: 'text-surface-500',
    hint: 'text-surface-500',
  },
  warn: {
    box: 'bg-amber-500/10 border-amber-500/45',
    icon: 'text-amber-400',
    title: 'text-amber-100/95',
    value: 'text-amber-50',
    hint: 'text-amber-200/85',
  },
  ok: {
    box: 'bg-green-500/10 border-green-500/45',
    icon: 'text-green-400',
    title: 'text-green-100/95',
    value: 'text-green-50',
    hint: 'text-green-200/85',
  },
} as const;

const ROADMAP_TILE_CLASS =
  'rounded-lg border flex flex-col w-[7.5rem] h-[7.5rem] sm:w-[8.25rem] sm:h-[8.25rem] mx-auto sm:mx-0 p-[9px] justify-between gap-1 text-left font-inherit cursor-pointer transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-amber-500/50';

/** Encart compact « Sans … » : même gabarit pour les 13 contrôles Roadmap. */
function RoadmapMissingIndicatorTile({
  indicator,
  onOpen,
}: {
  indicator: RoadmapMissingIndicator;
  onOpen: (id: RoadmapMissingIndicatorId) => void;
}) {
  const { def, hasColumn, missingCount, applicableCount } = indicator;
  const Icon = ROADMAP_MISSING_INDICATOR_ICONS[def.id];
  const noScope = hasColumn && applicableCount === 0;
  const tone =
    ROADMAP_TILE_TONES[!hasColumn || noScope ? 'muted' : missingCount > 0 ? 'warn' : 'ok'];
  const hint = !hasColumn
    ? 'Colonne absente.'
    : noScope
      ? 'Aucune ligne concernée.'
      : missingCount === 0
        ? 'Toutes les lignes renseignées.'
        : `${def.hint} Sur ${applicableCount} ligne(s).`;
  return (
    <button
      type="button"
      onClick={() => onOpen(def.id)}
      title={`${def.label} — voir le détail des lignes`}
      className={`${ROADMAP_TILE_CLASS} ${tone.box}`}
    >
      <div className="flex items-start gap-1.5 min-h-0">
        <Icon className={`w-[18px] h-[18px] shrink-0 mt-0.5 ${tone.icon}`} aria-hidden />
        <h4
          className={`text-[10px] font-semibold uppercase tracking-wide leading-tight line-clamp-2 ${tone.title}`}
        >
          {def.label}
        </h4>
      </div>
      <div className="flex flex-1 items-center justify-center min-h-0">
        <span className={`text-3xl font-bold tabular-nums leading-none ${tone.value}`}>
          {hasColumn ? missingCount : '—'}
        </span>
      </div>
      <p className={`text-[9px] text-center leading-tight line-clamp-2 ${tone.hint}`}>{hint}</p>
    </button>
  );
}

export function ProduitDashboard() {
  const socket = useSocketOptional();
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
  const [showIntegrationsEnCoursModal, setShowIntegrationsEnCoursModal] = useState(false);
  const [integrationTimelineRow, setIntegrationTimelineRow] = useState<IntegrationEnCours | null>(null);
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
    RoadmapMissingIndicatorId | 'raf' | null
  >(null);
  const [suiviSectionOpen, setSuiviSectionOpen] = useState(true);
  const [detailBoard, setDetailBoard] = useState<'roadmap' | 'suivi' | null>(null);
  const [detailKpi, setDetailKpi] = useState<string | null>(null);
  const [roadmapQuarterFilter, setRoadmapQuarterFilter] = useState<RoadmapAdoriaQuarterFilter>('all');
  /** Statuts cochés ; vide = pas de filtre sur le statut (tous). */
  const [roadmapStatusSelected, setRoadmapStatusSelected] = useState<string[]>([]);
  /** Teams cochées ; vide = pas de filtre team (toutes). */
  const [roadmapTeamSelected, setRoadmapTeamSelected] = useState<string[]>([]);
  /** Préférences filtres chargées depuis l’API (appliquées après reset board). */
  const roadmapDefaultFiltersRef = useRef<RoadmapAdoria2026DefaultFilters | null>(null);
  const [roadmapDefaultsReady, setRoadmapDefaultsReady] = useState(false);
  const [savingRoadmapDefaults, setSavingRoadmapDefaults] = useState(false);
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
  const kpiDetailData = useMemo(():
    | {
        title: string;
        rows: { name: string; value: number }[];
      }
    | {
        title: string;
        columns: [string, string] | [string, string, string];
        rows: { name: string; value1: number; value2: number; value3?: number }[];
      }
    | null => {
    if (!detailKpi || !suiviData?.columns?.length || !suiviData?.items?.length) return null;
    const columns = suiviData.columns;
    const items = suiviData.items;
    const getCol = (keys: string[]) => findColumn(columns, keys);
    const getColById = (id: string) => columns.find((c) => String(c.id) === id) ?? null;
    const getVal = (item: MondayItem, col: MondayColumn) => getItemNumericValue(item, col.id) || parseNum(getItemValue(item, col.id));

    switch (detailKpi) {
      case 'sitesActifs': {
        const colSites = getCol(SITES_ACTIFS_KEYS);
        const colTarget = getCol(TARGET_KEYS);
        if (!colSites && !colTarget) return null;
        const dataRows = items.map((item) => ({
          name: item.name || '—',
          value1: colSites ? getVal(item, colSites) : 0,
          value2: colTarget ? getVal(item, colTarget) : 0,
        }));
        const sorted = dataRows.sort((a, b) => b.value1 - a.value1 || b.value2 - a.value2);
        const totalSites = sorted.reduce((s, r) => s + r.value1, 0);
        const totalTarget = sorted.reduce((s, r) => s + r.value2, 0);
        return {
          title: 'Sites actifs / target',
          columns: ['Sites actifs', 'Sites cible (target)'],
          rows: [...sorted, { name: 'Total', value1: totalSites, value2: totalTarget }],
        };
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
        const colTarget = getCol(TARGET_KEYS);
        if (!col) return null;
        const dataRows = items
          .map((item) => ({
            name: item.name || '—',
            value1: getVal(item, col),
            value2: colCommandes ? getVal(item, colCommandes) : 0,
            value3: colTarget ? getVal(item, colTarget) : 0,
          }))
          .filter((r) => r.value1 > 0);
        const sorted = dataRows.sort((a, b) => b.value1 - a.value1 || b.value3 - a.value3);
        const totalCdc = sorted.reduce((s, r) => s + r.value1, 0);
        const totalCommandes = sorted.reduce((s, r) => s + r.value2, 0);
        const totalTarget = sorted.reduce((s, r) => s + r.value3, 0);
        return {
          title: 'CDC déployé — sites, commandes et target',
          columns: ['Sites CDC', 'Commandes via CDC', 'Sites cible (target)'],
          rows: [...sorted, { name: 'Total', value1: totalCdc, value2: totalCommandes, value3: totalTarget }],
        };
      }
      case 'totalProjets': {
        const col = getCol(TOTAL_PROJETS_KEYS);
        if (!col) return null;
        const rows = items.map((item) => ({ name: item.name || '—', value: getVal(item, col) }));
        return { title: 'Total projets', rows: rows.sort((a, b) => b.value - a.value) };
      }
      case 'totalUtilisateursActifs': {
        const colActifs =
          getColById(SUIVI_UTILISATEURS_ACTIFS_COLUMN_ID) ?? getCol(UTILISATEURS_ACTIFS_KEYS);
        const colBruts = getCol(UTILISATEURS_BRUTS_KEYS);
        if (!colActifs && !colBruts) return null;
        const dataRows = items.map((item) => ({
          name: item.name || '—',
          value1: colActifs ? getVal(item, colActifs) : 0,
          value2: colBruts ? getVal(item, colBruts) : 0,
        }));
        const sorted = dataRows.sort((a, b) => b.value1 - a.value1 || b.value2 - a.value2);
        const totalActifs = sorted.reduce((s, r) => s + r.value1, 0);
        const totalBruts = sorted.reduce((s, r) => s + r.value2, 0);
        return {
          title: 'Utilisateurs actifs / total',
          columns: ['Utilisateurs actifs', 'Total utilisateurs'],
          rows: [...sorted, { name: 'Total', value1: totalActifs, value2: totalBruts }],
        };
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
        return {
          title: 'Fiches techniques (actives / brut)',
          columns: ['Actives', 'Brut'],
          rows,
        };
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
        return {
          title: 'Produits génériques (brut / actifs)',
          columns: ['Brut', 'Actifs'],
          rows,
        };
      }
      default:
        return null;
    }
  }, [detailKpi, suiviData]);

  const roadmapDateColumn = useMemo(
    () => (roadmapData?.columns ? findRoadmapDateColumn(roadmapData.columns) : null),
    [roadmapData?.columns]
  );

  /** Colonne « CHR » (Q1/Q2/Q3/Q4/…) : trimestre en complément de la timeline « Date », pour les
   * lignes sans date renseignée mais déjà catégorisées par trimestre côté Monday. */
  const roadmapQuarterStatusColumn = useMemo(
    () => (roadmapData?.columns ? findRoadmapQuarterStatusColumn(roadmapData.columns) : null),
    [roadmapData?.columns]
  );

  const roadmapStatusColumn = useMemo(
    () => (roadmapData?.columns ? findColumn(roadmapData.columns, STATUS_KEYS) : null),
    [roadmapData?.columns]
  );

  const roadmapTeamColumn = useMemo(
    () => (roadmapData?.columns ? findColumn(roadmapData.columns, TEAM_KEYS) : null),
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

  const roadmapTeamOptions = useMemo(
    () => buildRoadmapTeamFilterOptions(roadmapData?.items ?? [], roadmapTeamColumn),
    [roadmapData?.items, roadmapTeamColumn]
  );

  const roadmapItemsForKpis = useMemo(() => {
    if (!roadmapData?.items?.length) return [];
    let items = roadmapData.items;
    if (roadmapQuarterFilter !== 'all' && (roadmapDateColumn || roadmapQuarterStatusColumn)) {
      const currentYear = new Date().getFullYear();
      const qTarget: CalendarQuarter =
        roadmapQuarterFilter === 'Q1' ? 1 : roadmapQuarterFilter === 'Q2' ? 2 : roadmapQuarterFilter === 'Q3' ? 3 : 4;
      items = items.filter((item) => {
        if (roadmapDateColumn) {
          const raw = getRoadmapDateColumnRaw(item, roadmapDateColumn.id);
          const { start, end } = parseRoadmapDateColumnRange(raw);
          if (start && end && roadmapRangeFullyInQuarterCurrentYear(start, end, qTarget, currentYear)) {
            return true;
          }
        }
        if (roadmapQuarterStatusColumn) {
          const chrValue = getItemValue(item, roadmapQuarterStatusColumn.id);
          if (roadmapQuarterStatusMatchesQuarter(chrValue, qTarget)) return true;
        }
        return false;
      });
    }
    if (roadmapStatusSelected.length > 0 && roadmapStatusColumn) {
      const allowed = new Set(roadmapStatusSelected);
      items = items.filter((item) => allowed.has(getRoadmapItemStatusLabel(item, roadmapStatusColumn)));
    }
    if (roadmapTeamSelected.length > 0 && roadmapTeamColumn) {
      const allowed = new Set(roadmapTeamSelected);
      items = items.filter((item) => allowed.has(getRoadmapItemTeamLabel(item, roadmapTeamColumn)));
    }
    return items;
  }, [
    roadmapData?.items,
    roadmapDateColumn,
    roadmapQuarterStatusColumn,
    roadmapQuarterFilter,
    roadmapStatusColumn,
    roadmapStatusSelected,
    roadmapTeamColumn,
    roadmapTeamSelected,
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

  /**
   * Les 13 contrôles « Sans … » (encarts + modales) sur les lignes filtrées
   * trimestre / statut / team, comme les graphiques Roadmap.
   */
  const roadmapMissingIndicators = useMemo(
    () => computeRoadmapMissingIndicators(roadmapItemsForKpis, roadmapData?.columns ?? []),
    [roadmapItemsForKpis, roadmapData?.columns]
  );

  /** Indicateur ouvert dans la modale de détail (hors RAF). */
  const roadmapIndicatorInModal = useMemo(
    () =>
      roadmapIndicatorModal && roadmapIndicatorModal !== 'raf'
        ? roadmapMissingIndicators.find((i) => i.def.id === roadmapIndicatorModal) ?? null
        : null,
    [roadmapIndicatorModal, roadmapMissingIndicators]
  );

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
    let cancelled = false;
    (async () => {
      try {
        const filters = await authApi.getRoadmapAdoria2026DefaultFilters();
        if (!cancelled) {
          roadmapDefaultFiltersRef.current = filters;
          setRoadmapQuarterFilter(filters.trimestre);
          setRoadmapStatusSelected(filters.statut);
          setRoadmapTeamSelected(filters.team ?? []);
        }
      } catch {
        // Non bloquant : on garde les filtres UI par défaut (tous / aucun statut / aucune team)
      } finally {
        if (!cancelled) setRoadmapDefaultsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!roadmapDefaultsReady) return;
    const d = roadmapDefaultFiltersRef.current;
    setRoadmapQuarterFilter(d?.trimestre ?? 'all');
    setRoadmapStatusSelected(d?.statut ?? []);
    setRoadmapTeamSelected(d?.team ?? []);
  }, [roadmapBoardId, roadmapDefaultsReady]);

  useEffect(() => {
    if (roadmapStatusOptions.length === 0) return;
    setRoadmapStatusSelected((prev) => {
      const next = prev.filter((s) => roadmapStatusOptions.includes(s));
      if (next.length === prev.length && next.every((s, i) => s === prev[i])) return prev;
      return next;
    });
  }, [roadmapStatusOptions]);

  useEffect(() => {
    if (roadmapTeamOptions.length === 0) return;
    setRoadmapTeamSelected((prev) => {
      const next = prev.filter((t) => roadmapTeamOptions.includes(t));
      if (next.length === prev.length && next.every((t, i) => t === prev[i])) return prev;
      return next;
    });
  }, [roadmapTeamOptions]);

  const handleSaveRoadmapDefaultFilters = useCallback(async () => {
    setSavingRoadmapDefaults(true);
    try {
      const filters: RoadmapAdoria2026DefaultFilters = {
        trimestre: roadmapQuarterFilter,
        statut: [...roadmapStatusSelected],
        team: [...roadmapTeamSelected],
      };
      const saved = await authApi.saveRoadmapAdoria2026DefaultFilters(filters);
      roadmapDefaultFiltersRef.current = saved;
      socket?.notify?.success(
        'Filtres enregistrés',
        'Ces filtres trimestre, statut et team seront appliqués par défaut à chaque visite.'
      );
    } catch {
      socket?.notify?.error(
        'Erreur',
        'Impossible d’enregistrer les filtres par défaut. Réessayez plus tard.'
      );
    } finally {
      setSavingRoadmapDefaults(false);
    }
  }, [roadmapQuarterFilter, roadmapStatusSelected, roadmapTeamSelected, socket]);

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
          {(roadmapLoading || !roadmapDefaultsReady) && (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
          )}
          {!roadmapLoading && roadmapDefaultsReady && roadmapKpis && (
            <div className="p-6 space-y-6">
              {(roadmapDateColumn || roadmapStatusColumn || roadmapTeamColumn) && (
                <div className="flex flex-wrap items-start gap-x-8 gap-y-3 pb-1 border-b border-surface-700/40">
                  {roadmapDateColumn && (
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                      <span className="text-xs font-medium text-surface-500 uppercase tracking-wide shrink-0">
                        Trimestre
                      </span>
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-label="Filtrer les KPI Roadmap par trimestre (colonne DATE, complétée par la colonne CHR)"
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
                  {roadmapTeamColumn && roadmapTeamOptions.length > 0 && (
                    <div className="flex flex-col gap-2 min-w-0 max-w-full sm:max-w-[36rem]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-surface-500 uppercase tracking-wide shrink-0">
                          Team
                        </span>
                        <button
                          type="button"
                          onClick={() => setRoadmapTeamSelected([])}
                          className="text-xs text-amber-400/90 hover:text-amber-300 underline-offset-2 hover:underline"
                        >
                          Toutes les teams
                        </button>
                        <span className="text-xs text-surface-500 hidden sm:inline">
                          (aucune case = tout afficher)
                        </span>
                      </div>
                      <div
                        className="flex flex-wrap gap-x-4 gap-y-2 max-h-36 overflow-y-auto rounded-lg border border-surface-700/40 bg-surface-900/40 px-3 py-2"
                        role="group"
                        aria-label="Filtrer par une ou plusieurs teams"
                      >
                        {roadmapTeamOptions.map((t) => {
                          const checked = roadmapTeamSelected.includes(t);
                          return (
                            <label
                              key={t}
                              className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-surface-200"
                            >
                              <input
                                type="checkbox"
                                className="rounded border-surface-600 bg-surface-900 text-amber-500 focus:ring-amber-500/40"
                                checked={checked}
                                onChange={() => {
                                  setRoadmapTeamSelected((prev) => {
                                    if (prev.includes(t)) return prev.filter((x) => x !== t);
                                    return [...prev, t].sort((a, b) => a.localeCompare(b, 'fr'));
                                  });
                                }}
                              />
                              <span className="truncate max-w-[14rem]" title={t}>
                                {t}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex items-end ml-auto">
                    <button
                      type="button"
                      onClick={handleSaveRoadmapDefaultFilters}
                      disabled={savingRoadmapDefaults || !roadmapDefaultsReady}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-surface-700/50 bg-surface-800/50 text-surface-300 hover:text-amber-200 hover:border-amber-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Enregistrer le trimestre, les statuts et les teams sélectionnés comme filtres par défaut"
                    >
                      {savingRoadmapDefaults ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Enregistrer comme filtres par défaut
                    </button>
                  </div>
                </div>
              )}
              {(roadmapQuarterFilter !== 'all' ||
                roadmapStatusSelected.length > 0 ||
                roadmapTeamSelected.length > 0) &&
                roadmapItemsForKpis.length === 0 &&
                (roadmapData?.items?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                    Aucune ligne ne correspond aux filtres sélectionnés (trimestre : année en cours, plage dans le trimestre ;
                    et/ou statut ; et/ou team).
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
              {/* Ratio global + les 13 encarts « Sans … » (+ RAF trimestre) */}
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

                <div className="grid gap-3 justify-items-center sm:justify-items-stretch grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                  {/* Encarts compacts « Sans … » (13 contrôles) + RAF trimestre */}
                  {roadmapMissingIndicators.map((indicator) => (
                    <RoadmapMissingIndicatorTile
                      key={indicator.def.id}
                      indicator={indicator}
                      onOpen={setRoadmapIndicatorModal}
                    />
                  ))}

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
                        Valeurs numériques sur les lignes filtrées (trimestre Q1–Q4 / année en cours + statuts + teams), comme les KPI
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
                          Aucune ligne ne correspond aux filtres trimestre / statut / team — le diagramme est vide.
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
                <button
                  type="button"
                  onClick={() => setDetailKpi('sitesActifs')}
                  className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer sm:col-span-2"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium text-surface-500">Sites actifs / target</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.sitesActifs}</div>
                      <div className="text-[11px] text-surface-400 leading-snug mt-0.5">Sites actifs</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.target}</div>
                      <div className="text-[11px] text-surface-400 leading-snug mt-0.5">Sites cible (target)</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 rounded-full bg-surface-700/60 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={suiviKpis.sitesProgressionPct ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Progression sites actifs vs target"
                    >
                      <div
                        className="h-full rounded-full bg-amber-400/80"
                        style={{ width: `${suiviKpis.sitesProgressionPct ?? 0}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-amber-300">
                      {suiviKpis.sitesProgressionPct != null ? `${suiviKpis.sitesProgressionPct} %` : '—'}
                    </span>
                  </div>
                </button>
                <button type="button" onClick={() => setDetailKpi('cdcDeploye')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer sm:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-medium text-surface-500">CDC déployé</span>
                    {suiviKpis.cdcProjetsCount > 0 && (
                      <span className="text-[10px] text-surface-500 tabular-nums">
                        · {suiviKpis.cdcProjetsCount} projet{suiviKpis.cdcProjetsCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.cdcDeploye}</div>
                      <div className="text-[11px] text-surface-400 leading-snug mt-0.5">Sites déployés CDC</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalCommandesViaCdc}</div>
                      <div className="text-[11px] text-surface-400 leading-snug mt-0.5">Commandes via CDC</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.cdcTargetSites}</div>
                      <div className="text-[11px] text-surface-400 leading-snug mt-0.5">Sites cible (target)</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 rounded-full bg-surface-700/60 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={suiviKpis.cdcProgressionPct ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Progression déploiement CDC vs target"
                    >
                      <div
                        className="h-full rounded-full bg-green-400/80"
                        style={{ width: `${suiviKpis.cdcProgressionPct ?? 0}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-green-300">
                      {suiviKpis.cdcProgressionPct != null ? `${suiviKpis.cdcProgressionPct} %` : '—'}
                    </span>
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
                <button
                  type="button"
                  onClick={() => setShowIntegrationsEnCoursModal(true)}
                  className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left w-full cursor-pointer hover:border-emerald-500/40 hover:bg-surface-800/80 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Hourglass className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-medium text-surface-500">Intégrations en cours</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">
                    {suiviKpis.integrationsEnCours.length}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    <div className="text-[10px] text-surface-500">
                      sans prod · début ≥ {new Date().getFullYear() - 1}
                    </div>
                    {suiviKpis.integrationsEnCours.length > 0 && (
                      <div className="text-[10px] text-surface-600">
                        âge méd. {suiviKpis.integrationsEnCoursAgeMedianJours} j
                        {suiviKpis.integrationsEnCoursStuckCount > 0
                          ? ` · ${suiviKpis.integrationsEnCoursStuckCount} Stuck`
                          : ''}
                      </div>
                    )}
                  </div>
                </button>
                <button type="button" onClick={() => setDetailKpi('totalProjets')} className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <Folder className="w-4 h-4 text-surface-400" />
                    <span className="text-xs font-medium text-surface-500">Total projets</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalProjets}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailKpi('totalUtilisateursActifs')}
                  className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left hover:border-amber-500/40 hover:bg-surface-800/80 transition-colors cursor-pointer sm:col-span-2"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-medium text-surface-500">Utilisateurs actifs / total</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">
                        {suiviKpis.totalUtilisateursActifs}
                      </div>
                      <div className="text-[11px] text-surface-400 leading-snug mt-0.5">Utilisateurs actifs</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-surface-100 tabular-nums">
                        {suiviKpis.totalUtilisateursBruts}
                      </div>
                      <div className="text-[11px] text-surface-400 leading-snug mt-0.5">Total utilisateurs</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 rounded-full bg-surface-700/60 overflow-hidden"
                      role="progressbar"
                      aria-valuenow={suiviKpis.utilisateursProgressionPct ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Progression utilisateurs actifs vs total"
                    >
                      <div
                        className="h-full rounded-full bg-blue-400/80"
                        style={{ width: `${suiviKpis.utilisateursProgressionPct ?? 0}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-blue-300">
                      {suiviKpis.utilisateursProgressionPct != null
                        ? `${suiviKpis.utilisateursProgressionPct} %`
                        : '—'}
                    </span>
                  </div>
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
              {suiviKpis.integrationsEnCours.length > 0 && (
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-surface-200 flex items-center gap-2">
                        <Hourglass className="w-4 h-4 text-emerald-400" />
                        Intégrations en cours
                      </h3>
                      <p className="text-xs text-surface-500 mt-1">
                        Sans date de mise en prod · début projet ≥ {new Date().getFullYear() - 1} · triés du plus
                        ancien au plus récent
                      </p>
                      <p className="text-[10px] text-surface-600 mt-1">
                        Contour : <span className="text-emerald-400">●</span> &lt;90 j{' '}
                        <span className="text-yellow-400">●</span> 90–180 j{' '}
                        <span className="text-orange-400">●</span> &gt;180 j{' '}
                        <span className="text-amber-800">●</span> Stuck — barre : sites actifs / target
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-surface-400">
                      <span>
                        <span className="text-surface-200 font-semibold tabular-nums">
                          {suiviKpis.integrationsEnCours.length}
                        </span>{' '}
                        projets
                      </span>
                      <span>
                        médiane{' '}
                        <span
                          className={`font-semibold tabular-nums ${
                            INTEGRATION_EN_COURS_TONE_UI[
                              integrationEnCoursAgeTone(
                                suiviKpis.integrationsEnCoursAgeMedianJours,
                                false
                              )
                            ].text
                          }`}
                        >
                          {suiviKpis.integrationsEnCoursAgeMedianJours} j
                        </span>
                      </span>
                      <span>
                        moy.{' '}
                        <span className="tabular-nums">{suiviKpis.integrationsEnCoursAgeMoyenJours} j</span>
                      </span>
                      {suiviKpis.integrationsEnCoursStuckCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {suiviKpis.integrationsEnCoursStuckCount} Stuck
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-2.5" aria-label="Liste des intégrations en cours">
                    {suiviKpis.integrationsEnCours.map((row) => {
                      const tone = INTEGRATION_EN_COURS_TONE_UI[integrationEnCoursAgeTone(row.ageJours, row.stuck)];
                      const pct = row.progressionSitesPct;
                      const barWidth = pct ?? 0;
                      const startLabel = formatYmdFr(row.startDate);
                      const rollOutLabel = formatYmdFr(row.rollOutStartDate);
                      return (
                        <li key={row.itemId}>
                          <button
                            type="button"
                            onClick={() => setIntegrationTimelineRow(row)}
                            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${tone.row}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm text-surface-100 font-medium truncate">
                                  {row.clientName}
                                </span>
                                <span
                                  className="shrink-0 text-[11px] text-surface-400 tabular-nums"
                                  title="Sites actifs / target"
                                >
                                  {row.sitesActifs}
                                  {row.targetSites > 0 ? ` / ${row.targetSites}` : ''} site
                                  {row.sitesActifs === 1 && row.targetSites <= 1 ? '' : 's'}
                                </span>
                                {row.stuck && (
                                  <span
                                    className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.badge} ${tone.badgeText}`}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    Stuck
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-0.5 shrink-0 text-xs">
                                <div className="flex items-baseline gap-3">
                                  <span className="text-surface-500">début {startLabel}</span>
                                  <span className={`font-semibold tabular-nums ${tone.text}`}>
                                    {row.ageJours} j
                                  </span>
                                </div>
                                <div className="text-[11px] text-surface-500">
                                  roll-out {rollOutLabel}
                                  {row.joursDebutToRollOut != null && (
                                    <span className="text-surface-400 tabular-nums">
                                      {' '}
                                      · {row.joursDebutToRollOut >= 0 ? '+' : ''}
                                      {row.joursDebutToRollOut} j depuis début
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-surface-500">
                                  formation {formatYmdFr(row.formationStartDate)}
                                  {' → '}
                                  {formatYmdFr(row.formationEndDate)}
                                  {row.joursFormation != null && (
                                    <span className="text-surface-400 tabular-nums">
                                      {' '}
                                      · {row.joursFormation} j
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-1.5 flex-1 rounded-full bg-surface-700/60 overflow-hidden"
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={pct ?? undefined}
                                aria-label="Progression sites actifs sur target"
                                title={
                                  pct != null
                                    ? `${row.sitesActifs} / ${row.targetSites} sites (${pct} %)`
                                    : 'Target non renseignée'
                                }
                              >
                                <div
                                  className={`h-full rounded-full ${tone.bar}`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${tone.text}`}>
                                {pct != null ? `${pct} %` : '—'}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
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

      {/* Modale — détail des lignes d'un encart « Sans … » (ou RAF trimestre) */}
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
                {roadmapIndicatorInModal && `${roadmapIndicatorInModal.def.label} — détail des lignes`}
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
              Projets / lignes correspondant à l&apos;indicateur, avec les mêmes filtres KPI (trimestre / statut / team) que la
              section Roadmap.
              {roadmapIndicatorInModal?.gateColumn && roadmapIndicatorInModal.def.gate && (
                <>
                  {' '}
                  Seules les lignes dont « {roadmapIndicatorInModal.gateColumn.title} » vaut{' '}
                  {roadmapIndicatorInModal.def.gate.values.join(' ou ')} sont comptées.
                </>
              )}
            </p>
            <div className="p-4 overflow-auto flex-1 min-h-0">
              {roadmapIndicatorInModal && !roadmapIndicatorInModal.hasColumn && (
                <p className="text-sm text-surface-500">
                  Colonne « {roadmapIndicatorInModal.def.columnTitles[0]} » introuvable sur ce board.
                </p>
              )}
              {roadmapIndicatorInModal &&
                roadmapIndicatorInModal.hasColumn &&
                roadmapIndicatorInModal.missingCount === 0 && (
                  <p className="text-sm text-surface-500">
                    Toutes les lignes filtrées sont renseignées ({roadmapIndicatorInModal.applicableCount} ligne(s)
                    concernée(s)).
                  </p>
                )}
              {roadmapIndicatorModal === 'raf' && roadmapItemsRafDetail.length === 0 && (
                <p className="text-sm text-surface-500">
                  Aucun projet à boucler sur ce périmètre (filtre trimestre = trimestre calendaire en cours, échéance dans
                  le trimestre, statut non terminé).
                </p>
              )}
              {roadmapIndicatorInModal && roadmapIndicatorInModal.column && roadmapIndicatorInModal.missingCount > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-700/50">
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Nom</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">
                          {roadmapIndicatorInModal.column.title}
                        </th>
                        {roadmapStatusColumn && (
                          <th className="text-left py-2 px-3 text-xs font-medium text-surface-500 uppercase">Statut</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {roadmapIndicatorInModal.missingItems.map((item) => {
                        const display = getItemColumnLabelText(item, roadmapIndicatorInModal.column!.id);
                        return (
                          <tr key={item.id} className="border-b border-surface-700/30">
                            <td className="py-2 px-3 text-surface-200 align-top">{item.name || '—'}</td>
                            <td
                              className="py-2 px-3 text-surface-400 align-top max-w-[16rem]"
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
                        {('columns' in kpiDetailData ? kpiDetailData.columns : ['Col. 1', 'Col. 2']).map((h) => (
                          <th
                            key={h}
                            className="text-right py-2 px-3 text-xs font-medium text-surface-500 uppercase"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(kpiDetailData.rows as { name: string; value1: number; value2: number; value3?: number }[])
                        .map((row, i) => (
                          <tr
                            key={i}
                            className={`border-b border-surface-700/30 ${row.name === 'Total' ? 'font-semibold' : ''}`}
                          >
                            <td className="py-2 px-3 text-surface-200">{row.name}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-surface-100">{row.value1}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-surface-100">{row.value2}</td>
                            {'columns' in kpiDetailData && kpiDetailData.columns.length >= 3 && (
                              <td className="py-2 px-3 text-right tabular-nums text-surface-100">
                                {row.value3 ?? 0}
                              </td>
                            )}
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

      {/* Modal Intégrations en cours */}
      {showIntegrationsEnCoursModal && suiviKpis && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowIntegrationsEnCoursModal(false)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl max-w-xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface-700">
              <div className="flex items-center gap-2 min-w-0">
                <Hourglass className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-surface-100">Intégrations en cours</h3>
                  <p className="text-xs text-surface-500">
                    Début ≥ {new Date().getFullYear() - 1} · sans mise en prod
                    {suiviKpis.integrationsEnCoursStuckCount > 0
                      ? ` · ${suiviKpis.integrationsEnCoursStuckCount} Stuck`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIntegrationsEnCoursModal(false)}
                className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {suiviKpis.integrationsEnCours.length === 0 ? (
                <p className="text-surface-500 text-sm">
                  Aucune intégration en cours (début renseigné, pas de date de prod, année ≥ n−1).
                </p>
              ) : (
                <ul className="space-y-2">
                  {suiviKpis.integrationsEnCours.map((row) => {
                    const tone = INTEGRATION_EN_COURS_TONE_UI[integrationEnCoursAgeTone(row.ageJours, row.stuck)];
                    const pct = row.progressionSitesPct;
                    return (
                      <li key={row.itemId}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowIntegrationsEnCoursModal(false);
                            setIntegrationTimelineRow(row);
                          }}
                          className={`w-full text-left rounded-lg border px-3 py-2 space-y-1.5 transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${tone.row}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="text-surface-200 truncate">{row.clientName}</span>
                              <span className="shrink-0 text-[11px] text-surface-400 tabular-nums">
                                {row.sitesActifs}
                                {row.targetSites > 0 ? ` / ${row.targetSites}` : ''}
                              </span>
                              {row.stuck && (
                                <span
                                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${tone.badgeText}`}
                                >
                                  Stuck
                                </span>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={`font-semibold tabular-nums ${tone.text}`}>
                                {row.ageJours} j
                              </div>
                              <div className="text-[10px] text-surface-500">début {row.startDate}</div>
                              <div className="text-[10px] text-surface-500">
                                RO {row.rollOutStartDate ?? '—'}
                                {row.joursDebutToRollOut != null
                                  ? ` · ${row.joursDebutToRollOut >= 0 ? '+' : ''}${row.joursDebutToRollOut} j`
                                  : ''}
                              </div>
                              <div className="text-[10px] text-surface-500">
                                form. {row.formationStartDate ?? '—'} → {row.formationEndDate ?? '—'}
                                {row.joursFormation != null ? ` · ${row.joursFormation} j` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-surface-700/60 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${tone.bar}`}
                                style={{ width: `${pct ?? 0}%` }}
                              />
                            </div>
                            <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${tone.text}`}>
                              {pct != null ? `${pct} %` : '—'}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal timeline détail d’une intégration */}
      {integrationTimelineRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setIntegrationTimelineRow(null)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="integration-timeline-title"
          >
            {(() => {
              const row = integrationTimelineRow;
              const tone = INTEGRATION_EN_COURS_TONE_UI[integrationEnCoursAgeTone(row.ageJours, row.stuck)];
              const events = buildIntegrationTimelineEvents(row);
              const kindDot: Record<string, string> = {
                start: 'bg-emerald-400',
                rollout: 'bg-sky-400',
                formationStart: 'bg-violet-400',
                formationEnd: 'bg-violet-300',
                today: 'bg-amber-500',
              };
              /** Hauteur du connecteur entre deux évènements (px), proportionnelle à l’écart en jours. */
              const gapPx = (deltaJours: number) =>
                Math.max(12, Math.min(96, Math.round(Math.sqrt(Math.max(0, deltaJours)) * 10)));
              return (
                <>
                  <div className="flex items-center justify-between p-4 border-b border-surface-700">
                    <div className="min-w-0">
                      <h3
                        id="integration-timeline-title"
                        className="text-lg font-semibold text-surface-100 truncate"
                      >
                        {row.clientName}
                      </h3>
                      <p className="text-xs text-surface-500 mt-0.5">
                        Timeline depuis le début · {row.ageJours} j
                        {row.stuck ? ' · Stuck' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIntegrationTimelineRow(null)}
                      className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200 shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="px-5 pt-4 pb-1">
                    <div
                      className="rounded-lg border border-surface-700/60 bg-surface-800/30 px-3 py-2.5 space-y-2"
                      aria-label="Progression des sites"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-surface-200">
                          Sites actifs{' '}
                          <span className="font-semibold tabular-nums text-surface-100">
                            {row.sitesActifs}
                          </span>
                          {row.targetSites > 0 && (
                            <>
                              <span className="text-surface-500"> / target </span>
                              <span className="font-semibold tabular-nums text-surface-100">
                                {row.targetSites}
                              </span>
                            </>
                          )}
                        </span>
                        <span className={`text-sm font-semibold tabular-nums ${tone.text}`}>
                          {row.progressionSitesPct != null ? `${row.progressionSitesPct} %` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 flex-1 rounded-full bg-surface-700/60 overflow-hidden"
                          role="progressbar"
                          aria-valuenow={row.progressionSitesPct ?? 0}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Pourcentage de sites activés"
                        >
                          <div
                            className={`h-full rounded-full ${tone.bar}`}
                            style={{ width: `${row.progressionSitesPct ?? 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 overflow-y-auto flex-1">
                    <ol className="relative" aria-label="Timeline des événements">
                      {events.map((ev, idx) => {
                        const prev = idx > 0 ? events[idx - 1] : null;
                        const delta = prev != null ? ev.offsetJours - prev.offsetJours : 0;
                        return (
                          <li key={ev.id}>
                            {prev != null && (
                              <div
                                className="ml-[7px] flex flex-col items-center"
                                style={{ height: gapPx(delta) }}
                                aria-hidden
                              >
                                <div className="w-px flex-1 bg-surface-600/80" />
                                {delta > 0 && (
                                  <span className="my-0.5 text-[10px] tabular-nums text-surface-500">
                                    +{delta} j
                                  </span>
                                )}
                                <div className="w-px flex-1 bg-surface-600/80" />
                              </div>
                            )}
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-1.5 w-3.5 h-3.5 rounded-full border-2 border-surface-900 shrink-0 ${
                                  kindDot[ev.kind] || 'bg-surface-400'
                                }`}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1 rounded-lg border border-surface-700/50 bg-surface-800/40 px-3 py-2">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                  <span className="text-sm font-medium text-surface-100">{ev.label}</span>
                                  <span className={`text-xs font-semibold tabular-nums ${tone.text}`}>
                                    {ev.offsetJours === 0
                                      ? 'J+0'
                                      : `J${ev.offsetJours >= 0 ? '+' : ''}${ev.offsetJours}`}
                                  </span>
                                </div>
                                <div className="text-[11px] text-surface-500 mt-0.5">
                                  {ev.date ? formatYmdFr(ev.date) : '—'}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </>
              );
            })()}
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
