import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Package,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  LayoutGrid,
  User,
  RefreshCw,
  ChevronRight,
  List,
  MapPin,
  Target,
  Building2,
  Smile,
  Folder,
  Globe,
  Clock,
  BarChart3,
  X,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, RadialBarChart, RadialBar } from 'recharts';
import { mondayApi, MondayUser, MondayBoard, MondayColumn, MondayItem, MondayWorkspace } from '../services/api';

const PAYS_COLUMN_KEYS = ['pays', 'country', 'country code', 'nationalité'];
const SITES_ACTIFS_KEYS = ['sites actifs', 'sites_actifs', 'active sites'];
const TARGET_KEYS = ['target', 'objectif', 'cible'];
const CDC_KEYS = ['cdc déployé', 'cdc', 'cdc deployé', 'cdc deploye'];
const SATISFACTION_KEYS = [
  'degré satisfaction client (engagement CP)',
  'degre satisfaction client',
  'satisfaction client (engagement',
  'engagement CP)',
  'satisfaction',
  'taux satisfaction',
  'satisfaction global',
];
const DATE_MISE_EN_PROD_KEYS = ['date mise en production', 'mise en production', 'go live', 'lancement production', 'date de lancement en production', 'date lancement production', 'production'];
const PROJECT_START_DATE_KEYS = ['project start date', 'date début projet', 'start date', 'date de début', 'début projet', 'date start', 'date début'];
const TOTAL_PROJETS_KEYS = ['total projets', 'nb projets', 'nombre projets', 'total'];
const UTILISATEURS_ACTIFS_KEYS = ["kpi adoria - nbre d'utilisateurs actifs", 'utilisateurs actifs', 'nb utilisateurs actifs', 'nombre utilisateurs actifs', 'users actifs', 'active users'];
const UTILISATEURS_BRUTS_KEYS = ["kpi adoria - nbre d'utilisateurs bruts", 'utilisateurs bruts', 'nb utilisateurs bruts', 'nombre utilisateurs bruts'];
const REFERENCES_MERCURIAL_KEYS = ['références mercurial', 'references mercurial', 'ref mercurial', 'mercurial', 'nb ref mercurial'];
const FICHES_TECHNIQUES_ACTIVES_KEYS = ['fiches techniques actives', 'fiche technique active', 'ft actives', 'nb ft actives'];
const FICHES_TECHNIQUES_BRUT_KEYS = ['kpi adoria - nombre brut de fiches techniques', 'fiches techniques brut', 'fiches techniques brutes', 'ft brut', 'ft brutes', 'nb ft brut'];

/** Workspace name for NPS Fev 2026 Monday (exact or partial match). */
const NPS_FEV_2026_WORKSPACE_NAME = 'NPS Fev 2026 Monday';
/** Flexible match: NPS + (Fev|Fév|Feb) + 2026 + Monday so different spellings still show the NPS KPIs. */
function isNpsFev2026Workspace(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const n = name.toLowerCase().trim();
  const hasNps = n.includes('nps');
  const hasMonth = n.includes('fev') || n.includes('fév') || n.includes('feb');
  const hasYear = n.includes('2026');
  const hasMonday = n.includes('monday');
  return !!(hasNps && hasYear && (hasMonday || hasMonth));
}
const NPS_SCORE_KEYS = ['nps', 'score nps', 'note nps', 'recommandation', 'note', 'score', 'note recommandation', 'how likely'];
const NPS_CATEGORY_KEYS = ['catégorie nps', 'statut nps', 'type nps', 'segment', 'promoteur', 'détracteur', 'passif', 'nps category'];

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
  const cv = item.column_values?.find((c) => c.id === columnId);
  return (cv?.text ?? cv?.value ?? '').toString().trim();
}

/** Extract numeric value from a Monday column (handles "numbers" type with value as JSON e.g. {"number": "5"}). */
function getItemNumericValue(item: MondayItem, columnId: string): number {
  const cv = item.column_values?.find((c) => c.id === columnId);
  if (!cv) return 0;
  const text = (cv.text ?? '').toString().trim();
  const rawValue = (cv.value ?? '').toString().trim();
  // Monday "numbers" column often returns value as JSON {"number": "5"} or similar
  if (rawValue.startsWith('{')) {
    try {
      const o = JSON.parse(rawValue) as Record<string, unknown>;
      const num = o.number ?? o.value ?? o.num;
      if (num !== undefined && num !== null) {
        const n = typeof num === 'number' ? num : parseNum(String(num));
        return Number.isFinite(n) ? n : 0;
      }
    } catch {
      // ignore
    }
  }
  return parseNum(text || rawValue);
}

/** Binary satisfaction column: returns 'satisfait' | 'pas satisfait' | null (empty). Uses text or JSON label. */
function getSatisfactionStatus(item: MondayItem, columnId: string): 'satisfait' | 'pas satisfait' | null {
  const cv = item.column_values?.find((c) => c.id === columnId);
  let text = (cv?.text ?? '').toString().trim();
  const rawValue = (cv?.value ?? '').toString().trim();
  if (!text && rawValue) {
    if (rawValue.startsWith('{')) {
      try {
        const o = JSON.parse(rawValue) as Record<string, unknown>;
        text = String(o.label ?? o.text ?? o.value ?? '').trim();
      } catch {
        text = rawValue;
      }
    } else {
      text = rawValue;
    }
  }
  const lower = text.toLowerCase();
  if (!lower) return null;
  if (lower.includes('pas satisfait') || lower.includes('non satisfait') || lower === 'non' || lower === 'non satisfait') return 'pas satisfait';
  if (lower.includes('satisfait')) return 'satisfait';
  return 'pas satisfait';
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
  const dmy = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
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
  satisfactionMoy: number;
  satisfactionByClient: { clientName: string; status: 'satisfait' | 'pas satisfait' }[];
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
} {
  const colSitesActifs = findColumn(columns, SITES_ACTIFS_KEYS);
  const colTarget = findColumn(columns, TARGET_KEYS);
  const colCdc = findColumn(columns, CDC_KEYS);
  const colSatisfaction = findColumn(columns, SATISFACTION_KEYS);
  const colDateProd = findColumn(columns, DATE_MISE_EN_PROD_KEYS);
  const colStartDate = findColumn(columns, PROJECT_START_DATE_KEYS);
  const colTotalProjets = findColumn(columns, TOTAL_PROJETS_KEYS);
  const colPays = findColumn(columns, PAYS_COLUMN_KEYS);
  const colUtilisateursActifs = findColumn(columns, UTILISATEURS_ACTIFS_KEYS);
  const colUtilisateursBruts = findColumn(columns, UTILISATEURS_BRUTS_KEYS);
  const colReferencesMercurial = findColumn(columns, REFERENCES_MERCURIAL_KEYS);
  const colFichesTechniquesActives = findColumn(columns, FICHES_TECHNIQUES_ACTIVES_KEYS);
  const colFichesTechniquesBrut = findColumn(columns, FICHES_TECHNIQUES_BRUT_KEYS);

  let sitesActifs = 0;
  let target = 0;
  let cdcDeploye = 0;
  let totalUtilisateursActifs = 0;
  let totalUtilisateursBruts = 0;
  let totalReferencesMercurial = 0;
  let totalFichesTechniquesActives = 0;
  let totalFichesTechniquesBrut = 0;
  let satisfactionSatisfaitCount = 0;
  const satisfactionByClient: { clientName: string; status: 'satisfait' | 'pas satisfait' }[] = [];
  let totalProjets = 0;
  const paysCount = new Map<string, number>();
  const countByYear = new Map<number, number>();
  const dureesByYear = new Map<number, number[]>();
  const dureesJours: number[] = [];
  const delaiByClient: { clientName: string; dureeJours: number }[] = [];
  const currentYear = new Date().getFullYear();

  for (const item of items) {
    if (colSitesActifs) sitesActifs += parseNum(getItemValue(item, colSitesActifs.id));
    if (colTarget) target += parseNum(getItemValue(item, colTarget.id));
    if (colCdc) cdcDeploye += parseNum(getItemValue(item, colCdc.id)) || (getItemValue(item, colCdc.id) ? 1 : 0);
    if (colSatisfaction) {
      const status = getSatisfactionStatus(item, colSatisfaction.id);
      if (status) {
        if (status === 'satisfait') satisfactionSatisfaitCount += 1;
        satisfactionByClient.push({ clientName: item.name || 'Sans nom', status });
      }
    }
    if (colTotalProjets) totalProjets += parseNum(getItemValue(item, colTotalProjets.id));
    if (colUtilisateursActifs) totalUtilisateursActifs += getItemNumericValue(item, colUtilisateursActifs.id);
    if (colUtilisateursBruts) totalUtilisateursBruts += getItemNumericValue(item, colUtilisateursBruts.id);
    if (colReferencesMercurial) totalReferencesMercurial += getItemNumericValue(item, colReferencesMercurial.id);
    if (colFichesTechniquesActives) totalFichesTechniquesActives += getItemNumericValue(item, colFichesTechniquesActives.id);
    if (colFichesTechniquesBrut) totalFichesTechniquesBrut += getItemNumericValue(item, colFichesTechniquesBrut.id);
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
  const satisfactionMoy =
    satisfactionByClient.length > 0 ? (satisfactionSatisfaitCount / satisfactionByClient.length) * 100 : 0;
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

  satisfactionByClient.sort((a, b) => (a.status === 'satisfait' && b.status !== 'satisfait' ? -1 : a.status !== 'satisfait' && b.status === 'satisfait' ? 1 : 0));

  return {
    sitesActifs,
    target,
    cdcDeploye,
    satisfactionMoy,
    satisfactionByClient,
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
  };
}

export type NpsCategory = 'promoteur' | 'passif' | 'détracteur';

function getNpsCategoryFromScore(score: number): NpsCategory {
  if (score >= 9) return 'promoteur';
  if (score >= 7) return 'passif';
  return 'détracteur';
}

function getNpsCategoryFromItem(item: MondayItem, scoreColumnId: string, categoryColumnId: string | null): NpsCategory | null {
  if (categoryColumnId) {
    const text = getItemValue(item, categoryColumnId).toLowerCase();
    if (text.includes('promoteur')) return 'promoteur';
    if (text.includes('passif')) return 'passif';
    if (text.includes('détracteur') || text.includes('detracteur')) return 'détracteur';
  }
  if (!scoreColumnId) return null;
  const raw = getItemValue(item, scoreColumnId).trim();
  if (!raw) return null;
  const num = parseNum(raw);
  const parsed = Number.isFinite(num) ? num : parseInt(raw.replace(/\D/g, ''), 10);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 10) return getNpsCategoryFromScore(parsed);
  return null;
}

export interface NpsKpis {
  totalReponses: number;
  promoteurs: number;
  passifs: number;
  detracteurs: number;
  pctPromoteurs: number;
  pctPassifs: number;
  pctDetracteurs: number;
  scoreNps: number; // -100 à +100
  scoreNpsSur10: number | null; // moyenne des notes si disponible
  alerts: { id: string; level: 'danger' | 'warning' | 'info'; message: string }[];
}

function computeNpsKpis(items: MondayItem[], columns: MondayColumn[]): NpsKpis | null {
  const colScore = findColumn(columns, NPS_SCORE_KEYS);
  const colCategory = findColumn(columns, NPS_CATEGORY_KEYS);
  if (!colScore && !colCategory) return null;

  let promoteurs = 0;
  let passifs = 0;
  let detracteurs = 0;
  let sumScore = 0;
  let countScore = 0;

  for (const item of items) {
    const cat = getNpsCategoryFromItem(item, colScore?.id ?? '', colCategory?.id ?? null);
    if (!cat) continue;
    if (cat === 'promoteur') promoteurs += 1;
    else if (cat === 'passif') passifs += 1;
    else detracteurs += 1;
    if (colScore) {
      const raw = getItemValue(item, colScore.id);
      const n = parseNum(raw) || (raw ? parseInt(raw.replace(/\D/g, ''), 10) : NaN);
      if (Number.isFinite(n) && n >= 0 && n <= 10) {
        sumScore += n;
        countScore += 1;
      }
    }
  }

  const totalReponses = promoteurs + passifs + detracteurs;
  if (totalReponses === 0) {
    return {
      totalReponses: 0,
      promoteurs: 0,
      passifs: 0,
      detracteurs: 0,
      pctPromoteurs: 0,
      pctPassifs: 0,
      pctDetracteurs: 0,
      scoreNps: 0,
      scoreNpsSur10: null,
      alerts: [{ id: 'no-data', level: 'info', message: 'Aucune réponse NPS trouvée dans ce board.' }],
    };
  }

  const pctPromoteurs = (promoteurs / totalReponses) * 100;
  const pctPassifs = (passifs / totalReponses) * 100;
  const pctDetracteurs = (detracteurs / totalReponses) * 100;
  const scoreNps = pctPromoteurs - pctDetracteurs; // -100 à +100
  const scoreNpsSur10 = countScore > 0 ? sumScore / countScore : null;

  const alerts: { id: string; level: 'danger' | 'warning' | 'info'; message: string }[] = [];
  if (scoreNps < 0) {
    alerts.push({ id: 'nps-negative', level: 'danger', message: 'Score NPS négatif : plus de détracteurs que de promoteurs.' });
  } else if (scoreNps < 30) {
    alerts.push({ id: 'nps-low', level: 'warning', message: 'Score NPS sous 30 : marge de progression importante.' });
  }
  if (pctDetracteurs > 20) {
    alerts.push({ id: 'detracteurs-high', level: 'warning', message: `Taux de détracteurs élevé (${pctDetracteurs.toFixed(0)} %) : prioriser les actions correctives.` });
  }
  if (pctPromoteurs >= 50 && scoreNps >= 50) {
    alerts.push({ id: 'nps-good', level: 'info', message: 'Score NPS satisfaisant : maintenir l’effort.' });
  }
  if (totalReponses < 10) {
    alerts.push({ id: 'low-responses', level: 'info', message: `Peu de réponses (${totalReponses}) : les indicateurs sont à prendre avec précaution.` });
  }

  return {
    totalReponses,
    promoteurs,
    passifs,
    detracteurs,
    pctPromoteurs,
    pctPassifs,
    pctDetracteurs,
    scoreNps,
    scoreNpsSur10,
    alerts,
  };
}

const DONUT_COLORS = ['#f59e0b', '#06b6d4', '#22c55e', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

export function ProduitDashboard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [me, setMe] = useState<MondayUser | null>(null);
  const [workspaces, setWorkspaces] = useState<MondayWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [boards, setBoards] = useState<MondayBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<{
    board: MondayBoard;
    columns: MondayColumn[];
    items: MondayItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suiviBoardId, setSuiviBoardId] = useState<string>('');
  const [suiviData, setSuiviData] = useState<{ columns: MondayColumn[]; items: MondayItem[] } | null>(null);
  const [suiviLoading, setSuiviLoading] = useState(false);
  const [showSatisfactionModal, setShowSatisfactionModal] = useState(false);
  const [showDelaiModal, setShowDelaiModal] = useState(false);
  const [npsBoardId, setNpsBoardId] = useState<string>('');
  const [npsData, setNpsData] = useState<{ columns: MondayColumn[]; items: MondayItem[] } | null>(null);
  const [npsLoading, setNpsLoading] = useState(false);

  const npsWorkspace = useMemo(
    () =>
      workspaces.find(
        (w) =>
          w.name === NPS_FEV_2026_WORKSPACE_NAME ||
          w.name.includes('NPS Fev 2026') ||
          w.name.includes('NPS Fev 2026 Monday') ||
          isNpsFev2026Workspace(w.name)
      ) ?? null,
    [workspaces]
  );
  const isNpsWorkspaceSelected = Boolean(selectedWorkspaceId && npsWorkspace && selectedWorkspaceId === npsWorkspace.id);

  const fetchStatusAndMe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, meRes] = await Promise.all([
        mondayApi.getStatus(),
        mondayApi.getMe(),
      ]);
      setConfigured(statusRes.configured);
      if (meRes.success && meRes.me) {
        setMe(meRes.me);
      } else {
        setMe(null);
      }
      if (statusRes.configured) {
        const workspacesRes = await mondayApi.getWorkspaces();
        if (workspacesRes.success && workspacesRes.workspaces) {
          setWorkspaces(workspacesRes.workspaces);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion à l’API');
      setConfigured(false);
      setMe(null);
      setBoards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatusAndMe();
  }, [fetchStatusAndMe]);

  useEffect(() => {
    if (!configured) return;
    const load = async () => {
      try {
        const workspaceIds = selectedWorkspaceId ? [selectedWorkspaceId] : undefined;
        const boardsRes = await mondayApi.getBoards(100, workspaceIds);
        if (boardsRes.success && boardsRes.boards) {
          setBoards(boardsRes.boards);
        }
      } catch {
        setBoards([]);
      }
    };
    load();
  }, [selectedWorkspaceId, configured]);

  useEffect(() => {
    if (!suiviBoardId || !configured) {
      setSuiviData(null);
      return;
    }
    setSuiviLoading(true);
    setSuiviData(null);
    mondayApi
      .getBoard(suiviBoardId, 500)
      .then((res) => {
        if (res.success && res.columns && res.items) {
          setSuiviData({ columns: res.columns, items: res.items });
        }
      })
      .finally(() => setSuiviLoading(false));
  }, [suiviBoardId, configured]);

  useEffect(() => {
    if (!npsBoardId || !configured) {
      setNpsData(null);
      return;
    }
    setNpsLoading(true);
    setNpsData(null);
    mondayApi
      .getBoard(npsBoardId, 500)
      .then((res) => {
        if (res.success && res.columns && res.items) {
          setNpsData({ columns: res.columns, items: res.items });
        }
      })
      .finally(() => setNpsLoading(false));
  }, [npsBoardId, configured]);

  const suiviKpis = useMemo(() => {
    if (!suiviData?.items.length) return null;
    return computeSuiviKpis(suiviData.items, suiviData.columns);
  }, [suiviData]);

  const npsKpis = useMemo(() => {
    if (!npsData?.items?.length) return null;
    return computeNpsKpis(npsData.items, npsData.columns);
  }, [npsData]);

  const openBoard = async (board: MondayBoard) => {
    setBoardLoading(true);
    setSelectedBoard(null);
    try {
      const res = await mondayApi.getBoard(board.id, 200);
      if (res.success && res.board && res.columns && res.items) {
        setSelectedBoard({
          board: res.board,
          columns: res.columns,
          items: res.items,
        });
      }
    } catch {
      setError('Impossible de charger le board');
    } finally {
      setBoardLoading(false);
    }
  };

  const closeBoard = () => {
    setSelectedBoard(null);
  };

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
            onClick={fetchStatusAndMe}
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
            onClick={fetchStatusAndMe}
            className="p-2 rounded-xl bg-surface-800/80 border border-surface-700/50 hover:bg-surface-700/50 text-surface-400 hover:text-surface-200 transition-colors"
            title="Rafraîchir"
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
        {workspaces.length > 0 && !selectedBoard && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-surface-500">Espace :</span>
            <select
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="rounded-xl bg-surface-800 border border-surface-600 text-surface-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            >
              <option value="">Tous les espaces</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {npsWorkspace && selectedWorkspaceId !== npsWorkspace.id && (
              <span className="text-xs text-surface-500">
                → Pour les KPI NPS Fev 2026 Monday, sélectionnez l'espace « {npsWorkspace.name} »
              </span>
            )}
          </div>
        )}
      </div>

      {/* NPS Fev 2026 Monday — KPI + indicateurs d'alerte */}
      {!selectedBoard && isNpsWorkspaceSelected && npsWorkspace && (
        <section className="mb-8 rounded-2xl border border-surface-700/50 bg-surface-900/30 overflow-hidden">
          <div className="p-4 border-b border-surface-700/50 bg-surface-800/30 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-400/80" />
              <h2 className="text-lg font-semibold text-surface-100">{npsWorkspace.name}</h2>
            </div>
            <select
              value={npsBoardId}
              onChange={(e) => setNpsBoardId(e.target.value)}
              className="rounded-xl bg-surface-800 border border-surface-600 text-surface-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            >
              <option value="">Choisir un board NPS…</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {boards.length === 0 && (
            <div className="p-6 text-surface-500 text-sm">
              Aucun board dans cet espace. Vérifiez les droits d'accès sur Monday.com ou le nom de l'espace.
            </div>
          )}
          {!npsLoading && boards.length > 0 && !npsBoardId && (
            <div className="p-6 text-surface-400 text-sm">
              Sélectionnez un board ci-dessus pour afficher les KPI NPS.
            </div>
          )}
          {npsLoading && (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
          )}
          {!npsLoading && npsKpis && (
            <div className="p-6 space-y-6">
              {/* Indicateurs d'alerte */}
              {npsKpis.alerts.length > 0 && (
                <div className="space-y-2">
                  {npsKpis.alerts.map((a) => (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                        a.level === 'danger'
                          ? 'bg-red-500/10 border-red-500/40 text-red-200'
                          : a.level === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                            : 'bg-blue-500/10 border-blue-500/40 text-surface-200'
                      }`}
                    >
                      {a.level === 'danger' ? (
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                      ) : a.level === 'warning' ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                      ) : (
                        <TrendingUp className="w-5 h-5 text-blue-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium">{a.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium text-surface-500">Score NPS</span>
                  </div>
                  <div
                    className={`text-2xl font-bold tabular-nums ${
                      npsKpis.scoreNps < 0
                        ? 'text-red-400'
                        : npsKpis.scoreNps < 30
                          ? 'text-amber-400'
                          : 'text-green-400'
                    }`}
                  >
                    {npsKpis.scoreNps > 0 ? '+' : ''}
                    {npsKpis.scoreNps.toFixed(0)}
                  </div>
                  <div className="text-[10px] text-surface-500 mt-0.5">-100 à +100</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare className="w-4 h-4 text-primary-400" />
                    <span className="text-xs font-medium text-surface-500">Réponses</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{npsKpis.totalReponses}</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-surface-500">Promoteurs</span>
                  </div>
                  <div className="text-xl font-bold text-green-400 tabular-nums">{npsKpis.pctPromoteurs.toFixed(1)} %</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">{npsKpis.promoteurs} réponses</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-surface-500">Passifs</span>
                  </div>
                  <div className="text-xl font-bold text-surface-300 tabular-nums">{npsKpis.pctPassifs.toFixed(1)} %</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">{npsKpis.passifs} réponses</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-surface-500">Détracteurs</span>
                  </div>
                  <div className="text-xl font-bold text-red-400 tabular-nums">{npsKpis.pctDetracteurs.toFixed(1)} %</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">{npsKpis.detracteurs} réponses</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-4 h-4 text-surface-400" />
                    <span className="text-xs font-medium text-surface-500">Note moy.</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">
                    {npsKpis.scoreNpsSur10 != null ? npsKpis.scoreNpsSur10.toFixed(1) : '—'} / 10
                  </div>
                </div>
              </div>
              {/* Répartition NPS (barre visuelle) */}
              <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                <h3 className="text-sm font-semibold text-surface-200 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  Répartition NPS
                </h3>
                <div className="flex h-8 rounded-lg overflow-hidden border border-surface-600/50">
                  <div
                    className="bg-green-500/80 transition-all"
                    style={{ width: `${npsKpis.pctPromoteurs}%` }}
                    title={`Promoteurs ${npsKpis.pctPromoteurs.toFixed(1)}%`}
                  />
                  <div
                    className="bg-surface-500/80 transition-all"
                    style={{ width: `${npsKpis.pctPassifs}%` }}
                    title={`Passifs ${npsKpis.pctPassifs.toFixed(1)}%`}
                  />
                  <div
                    className="bg-red-500/80 transition-all"
                    style={{ width: `${npsKpis.pctDetracteurs}%` }}
                    title={`Détracteurs ${npsKpis.pctDetracteurs.toFixed(1)}%`}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-surface-500">
                  <span>Promoteurs (9-10)</span>
                  <span>Passifs (7-8)</span>
                  <span>Détracteurs (0-6)</span>
                </div>
              </div>
            </div>
          )}
          {!npsLoading && npsBoardId && !npsKpis && npsData?.items.length === 0 && (
            <div className="p-6 text-surface-500 text-sm">Aucune donnée dans ce board.</div>
          )}
          {!npsLoading && npsBoardId && npsData?.items.length > 0 && !npsKpis && (
            <div className="p-6 text-amber-200/90 text-sm">
              Aucune colonne NPS trouvée. Utilisez une colonne « Score NPS » / « Note » (0-10) ou « Catégorie NPS » (Promoteur, Passif, Détracteur).
            </div>
          )}
        </section>
      )}

      {/* Suivi clients par CP — KPI + donut par pays */}
      {!selectedBoard && boards.length > 0 && (
        <section className="mb-8 rounded-2xl border border-surface-700/50 bg-surface-900/30 overflow-hidden">
          <div className="p-4 border-b border-surface-700/50 bg-surface-800/30 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-400/80" />
              <h2 className="text-lg font-semibold text-surface-100">Suivi clients par CP</h2>
            </div>
            <select
              value={suiviBoardId}
              onChange={(e) => setSuiviBoardId(e.target.value)}
              className="rounded-xl bg-surface-800 border border-surface-600 text-surface-200 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            >
              <option value="">Choisir un board pour les KPI…</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {suiviLoading && (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            </div>
          )}
          {!suiviLoading && suiviKpis && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium text-surface-500">Sites actifs</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.sitesActifs}</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="w-4 h-4 text-primary-400" />
                    <span className="text-xs font-medium text-surface-500">Target sites</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.target}</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-medium text-surface-500">CDC déployé</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.cdcDeploye}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSatisfactionModal(true)}
                  className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 text-left w-full cursor-pointer hover:border-accent-500/40 hover:bg-surface-800/80 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Smile className="w-4 h-4 text-accent-400" />
                    <span className="text-xs font-medium text-surface-500">Satisfaction</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">
                    {suiviKpis.satisfactionMoy > 0 ? `${suiviKpis.satisfactionMoy.toFixed(1)}%` : '—'}
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
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Folder className="w-4 h-4 text-surface-400" />
                    <span className="text-xs font-medium text-surface-500">Total projets</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalProjets}</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-medium text-surface-500">Utilisateurs actifs</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalUtilisateursActifs}</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">somme par site (Nbre d'utilisateurs actifs)</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-surface-400" />
                    <span className="text-xs font-medium text-surface-500">Total des utilisateurs</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalUtilisateursBruts}</div>
                  <div className="text-[10px] text-surface-500 mt-0.5">somme par site (Nbre utilisateurs bruts)</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-medium text-surface-500">Références Mercurial</span>
                  </div>
                  <div className="text-xl font-bold text-surface-100 tabular-nums">{suiviKpis.totalReferencesMercurial}</div>
                </div>
                <div className="rounded-xl bg-surface-800/50 border border-surface-700/50 p-4 flex flex-col items-center">
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
                </div>
              </div>
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
          {!suiviLoading && suiviBoardId && !suiviKpis && suiviData?.items.length === 0 && (
            <div className="p-6 text-surface-500 text-sm">Aucune donnée dans ce board.</div>
          )}
        </section>
      )}

      {selectedBoard ? (
        <div className="rounded-2xl border border-surface-700/50 bg-surface-900/30 overflow-hidden">
          <div className="p-4 border-b border-surface-700/50 flex items-center justify-between bg-surface-800/30">
            <div className="flex items-center gap-3">
              <button
                onClick={closeBoard}
                className="p-1.5 rounded-lg hover:bg-surface-700/50 text-surface-400 hover:text-surface-200 transition-colors"
                title="Retour aux boards"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
              <LayoutGrid className="w-5 h-5 text-amber-400/80" />
              <h2 className="text-lg font-semibold text-surface-100">
                {selectedBoard.board.name}
              </h2>
              {selectedBoard.board.itemCount != null && (
                <span className="text-sm text-surface-500">
                  {selectedBoard.board.itemCount} élément(s)
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-surface-700/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Nom
                  </th>
                  {selectedBoard.columns.map((col) => (
                    <th
                      key={col.id}
                      className="text-left py-3 px-4 text-xs font-medium text-surface-500 uppercase tracking-wider"
                    >
                      {col.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedBoard.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-surface-700/30 hover:bg-surface-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-surface-200 font-medium">
                      {item.name}
                    </td>
                    {selectedBoard.columns.map((col) => {
                      const cv = item.column_values?.find((c) => c.id === col.id);
                      const text = cv?.text ?? '—';
                      return (
                        <td
                          key={col.id}
                          className="py-3 px-4 text-surface-400 text-sm"
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Boards list */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boardLoading && (
            <div className="col-span-full flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent-500 animate-spin" />
            </div>
          )}
          {!boardLoading &&
            boards.map((board) => (
              <button
                key={board.id}
                onClick={() => openBoard(board)}
                className="text-left p-5 rounded-2xl border border-surface-700/50 bg-surface-900/30 hover:bg-surface-800/50 hover:border-surface-600/50 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20 transition-colors">
                      <List className="w-5 h-5 text-amber-400/80" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-surface-100 truncate">
                        {board.name}
                      </div>
                      {board.itemCount != null && (
                        <div className="text-sm text-surface-500">
                          {board.itemCount} élément(s)
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-surface-500 group-hover:text-amber-400/80 flex-shrink-0 transition-colors" />
                </div>
              </button>
            ))}
        </div>
      )}

      {!selectedBoard && !boardLoading && boards.length === 0 && (
        <div className="rounded-2xl border border-surface-700/50 bg-surface-900/30 p-12 text-center text-surface-500">
          Aucun board actif pour ce compte Monday.
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

      {/* Modal Satisfaction par client */}
      {showSatisfactionModal && suiviKpis && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSatisfactionModal(false)}
        >
          <div
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface-700">
              <div className="flex items-center gap-2">
                <Smile className="w-5 h-5 text-accent-400" />
                <h3 className="text-lg font-semibold text-surface-100">Satisfaction par client</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSatisfactionModal(false)}
                className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {suiviKpis.satisfactionByClient.length === 0 ? (
                <div className="text-surface-500 text-sm space-y-2">
                  <p>Aucune donnée de satisfaction renseignée.</p>
                  <p className="text-surface-600 text-xs">
                    Vérifiez que le board « Suivi clients par CP » contient une colonne nommée « Degré satisfaction client (engagement CP) » et que des valeurs sont renseignées.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {suiviKpis.satisfactionByClient.map((row, i) => (
                    <li
                      key={`${row.clientName}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-surface-800/50 border border-surface-700/50 px-3 py-2"
                    >
                      <span className="text-surface-200 truncate flex-1 mr-2">{row.clientName}</span>
                      {row.status === 'satisfait' ? (
                        <span className="shrink-0 flex items-center gap-1.5 text-green-500 font-medium" title="Satisfait">
                          <span className="text-xl" aria-hidden>😊</span>
                          <span>Satisfait</span>
                        </span>
                      ) : (
                        <span className="shrink-0 flex items-center gap-1.5 text-red-500 font-medium" title="Pas satisfait">
                          <span className="text-xl" aria-hidden>🙁</span>
                          <span>Pas satisfait</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
