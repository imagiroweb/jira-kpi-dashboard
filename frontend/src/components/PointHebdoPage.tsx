import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronsRight,
  ClipboardCopy,
  Cloud,
  CloudOff,
  History,
  Loader2,
  Pause,
  Play,
  Plus,
  Printer,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { meetingApi } from '../services/api';
import { useSocketOptional } from '../hooks/useSocketContext';
import type { MeetingUpdate } from '../hooks/useSocket';
import {
  applyPrefillToTeams,
  buildMeetingReport,
  computeMetricProgress,
  computePhaseRemainingSeconds,
  createAction,
  createBlocker,
  createInteraction,
  createMetric,
  createRetroItem,
  createTeam,
  findEngagedPointsValue,
  formatMeetingClock,
  getMetricTargetMode,
  MEETING_ACTION_STATUSES,
  MEETING_BLOCKER_SEVERITIES,
  MEETING_INTERACTION_STATUSES,
  MEETING_PHASES,
  MEETING_TOTAL_BUDGET_SECONDS,
  RETRO_COLUMNS,
  type MeetingAction,
  type MeetingActionStatus,
  type MeetingBlocker,
  type MeetingBlockerSeverity,
  type MeetingInteraction,
  type MeetingInteractionStatus,
  type MeetingRetroColumn,
  type MeetingTeam,
  type MeetingTeamRole,
  type SprintBoardResult,
  type WeeklyMeeting,
  type WeeklyMeetingPatch,
  type WeeklyMeetingSummary,
} from '../domain/pointHebdoSprint';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const SAVE_DEBOUNCE_MS = 500;

type SaveState = 'idle' | 'pending' | 'saved' | 'error';

const SEVERITY_STYLES: Record<MeetingBlockerSeverity, string> = {
  Faible: 'bg-surface-700/60 text-surface-200 border-surface-600',
  Moyen: 'bg-warning-500/15 text-warning-300 border-warning-500/40',
  'Élevé': 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  Critique: 'bg-danger-500/15 text-danger-300 border-danger-500/40',
};

const ACTION_STATUS_STYLES: Record<MeetingActionStatus, string> = {
  'À faire': 'text-surface-300',
  'En cours': 'text-warning-400 font-semibold',
  Fait: 'text-success-400 font-semibold',
};

const RETRO_DOT_STYLES: Record<MeetingRetroColumn, string> = {
  keep: 'bg-success-500',
  stop: 'bg-danger-500',
  try: 'bg-accent-500',
};

const inputClass =
  'w-full px-2.5 py-1.5 bg-surface-800/80 border border-surface-700 rounded-lg text-sm text-surface-100 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-colors';

const ghostInputClass =
  'w-full bg-transparent border border-transparent hover:border-surface-700 focus:border-accent-500 rounded-lg px-2 py-1 text-sm text-surface-100 placeholder-surface-500 focus:outline-none transition-colors';

interface ConfiguredBoard {
  id: number;
  name: string;
}

export function PointHebdoPage() {
  const [meeting, setMeeting] = useState<WeeklyMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [history, setHistory] = useState<WeeklyMeetingSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [reportText, setReportText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [boards, setBoards] = useState<ConfiguredBoard[]>([]);
  const [prefilling, setPrefilling] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<WeeklyMeetingPatch>({});
  const meetingIdRef = useRef<string | null>(null);
  meetingIdRef.current = meeting?.id ?? null;

  /* ---------------- édition collaborative (Socket.io) ---------------- */

  // Identifiant de cet onglet, généré une seule fois : permet d'ignorer l'écho de nos
  // propres PATCH quand le serveur les rediffuse à tous les clients de la réunion.
  const clientOriginRef = useRef<string | null>(null);
  if (clientOriginRef.current === null) {
    clientOriginRef.current =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const socketCtx = useSocketOptional();

  /* ---------------- chargement ---------------- */

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await meetingApi.getLatest();
        if (!cancelled && res.success) {
          setMeeting(res.meeting);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Impossible de charger le point hebdo'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadBoards = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/jira/configured-boards`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && Array.isArray(json.boards)) {
          setBoards(
            json.boards.map((b: { id: number; name?: string }) => ({
              id: b.id,
              name: b.name || `Board ${b.id}`,
            }))
          );
        }
      } catch {
        // Jira non configuré : le préremplissage reste simplement indisponible.
      }
    };
    loadBoards();
  }, []);

  // Rejoint la room temps réel du point ouvert (et la quitte au changement/démontage).
  const meetingSocketId = meeting?.id ?? null;
  useEffect(() => {
    if (!socketCtx || !meetingSocketId) return;
    socketCtx.subscribeToMeeting(meetingSocketId);
    return () => {
      socketCtx.unsubscribeFromMeeting(meetingSocketId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketCtx?.subscribeToMeeting, socketCtx?.unsubscribeFromMeeting, meetingSocketId]);

  // Applique les modifications reçues des autres clients éditant le même point.
  useEffect(() => {
    if (!socketCtx) return;
    return socketCtx.onMeetingUpdate((update: MeetingUpdate) => {
      // Mauvais point (onglet basculé sur un autre entre-temps) : on ignore.
      if (!meetingIdRef.current || update.meetingId !== meetingIdRef.current) return;
      // Notre propre écho (le serveur rediffuse aussi à l'auteur) : déjà appliqué localement.
      if (update.origin && update.origin === clientOriginRef.current) return;

      const incoming = (update.patch ?? {}) as Record<string, unknown>;
      const safePatch: WeeklyMeetingPatch = {};
      (['sprint', 'teams', 'blockers', 'interactions', 'retro', 'actions'] as const).forEach((key) => {
        if (!(key in incoming)) return;
        // Une section en cours de saisie locale non encore enregistrée n'est jamais
        // écrasée par une mise à jour distante : elle sera de toute façon renvoyée par le
        // prochain enregistrement automatique.
        if (key in pendingPatch.current) return;
        (safePatch as Record<string, unknown>)[key] = incoming[key];
      });

      if (Object.keys(safePatch).length === 0) return;
      setMeeting((current) => (current ? { ...current, ...safePatch } : current));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketCtx?.onMeetingUpdate]);

  /* ---------------- sauvegarde ---------------- */

  const flushSave = useCallback(async () => {
    const meetingId = meetingIdRef.current;
    const patch = pendingPatch.current;
    pendingPatch.current = {};
    if (!meetingId || Object.keys(patch).length === 0) return;
    try {
      await meetingApi.update(meetingId, patch, clientOriginRef.current ?? undefined);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, []);

  /** Applique une modification locale puis planifie l'enregistrement. */
  const applyChange = useCallback(
    (patch: WeeklyMeetingPatch) => {
      setMeeting((current) => (current ? { ...current, ...patch } : current));
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      setSaveState('pending');

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave]
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  /* ---------------- minuteur ---------------- */

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [phaseStartedAt, setPhaseStartedAt] = useState(0);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const remaining = computePhaseRemainingSeconds(phaseIndex, elapsed, phaseStartedAt);

  const goToPhase = (index: number) => {
    const next = Math.max(0, Math.min(MEETING_PHASES.length - 1, index));
    setPhaseIndex(next);
    setPhaseStartedAt(elapsed);
    document.getElementById(`phase-${MEETING_PHASES[next].id}`)?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const resetTimer = () => {
    setRunning(false);
    setElapsed(0);
    setPhaseIndex(0);
    setPhaseStartedAt(0);
  };

  /* ---------------- actions de page ---------------- */

  const openHistory = async () => {
    setShowHistory(true);
    try {
      const res = await meetingApi.list();
      if (res.success) setHistory(res.meetings);
    } catch {
      setHistory([]);
    }
  };

  const openMeeting = async (id: string) => {
    setShowHistory(false);
    setLoading(true);
    try {
      const res = await meetingApi.getById(id);
      if (res.success) {
        setMeeting(res.meeting);
        setSaveState('idle');
        resetTimer();
      }
    } catch {
      setError('Impossible d\'ouvrir ce point hebdo');
    } finally {
      setLoading(false);
    }
  };

  const startNextMeeting = async () => {
    if (!meeting) return;
    const confirmed = window.confirm(
      'Démarrer un nouveau point ?\n\nLes libellés d\'indicateurs, les cibles et les actions non terminées sont conservés ; les valeurs, blocages, interactions et la rétro repartent à zéro.'
    );
    if (!confirmed) return;
    try {
      const res = await meetingApi.createNext(meeting.id);
      if (res.success) {
        setMeeting(res.meeting);
        setSaveState('idle');
        resetTimer();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      setError('Impossible de créer le point suivant');
    }
  };

  const prefillFromJira = useCallback(
    async (teams: MeetingTeam[], { silent = false }: { silent?: boolean } = {}) => {
      setPrefilling(true);
      try {
        const res = await fetch(`${API_BASE_URL}/jira/dashboard/sprint-issues-all`);
        if (!res.ok) throw new Error('Jira indisponible');
        const json = await res.json();
        if (!json.success || !Array.isArray(json.boards)) throw new Error('Réponse Jira invalide');

        const results: SprintBoardResult[] = json.boards.map(
          (row: {
            boardId: number;
            name?: string;
            sprint?: Omit<SprintBoardResult, 'boardId'>;
          }) => ({
            boardId: row.boardId,
            name: row.name,
            ...(row.sprint ?? {}),
          })
        );
        applyChange({ teams: applyPrefillToTeams(teams, results) });
      } catch {
        if (!silent) setError('Préremplissage impossible : vérifiez la configuration Jira.');
      } finally {
        setPrefilling(false);
      }
    },
    [applyChange]
  );

  /**
   * Point fraîchement créé ou reconduit : les chiffres des équipes rattachées à
   * un board Jira sont remplis à l'ouverture, une seule fois.
   */
  const autoPrefilledId = useRef<string | null>(null);
  useEffect(() => {
    if (!meeting || autoPrefilledId.current === meeting.id) return;
    const linkedTeams = meeting.teams.filter((team) => team.boardId != null);
    const alreadyFilled = linkedTeams.some((team) =>
      team.metrics.some((metric) => metric.value.trim() !== '')
    );
    if (linkedTeams.length === 0 || alreadyFilled) return;
    autoPrefilledId.current = meeting.id;
    void prefillFromJira(meeting.teams, { silent: true });
  }, [meeting, prefillFromJira]);

  const copyReport = async () => {
    if (!meeting) return;
    const text = buildMeetingReport(meeting);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setReportText(text);
    }
  };

  /* ---------------- mutations de contenu ---------------- */

  const updateTeam = (teamId: string, changes: Partial<MeetingTeam>) => {
    if (!meeting) return;
    applyChange({
      teams: meeting.teams.map((team) => (team.id === teamId ? { ...team, ...changes } : team)),
    });
  };

  const updateMetric = (
    teamId: string,
    metricId: string,
    changes: Partial<{ label: string; value: string; target: string }>
  ) => {
    if (!meeting) return;
    applyChange({
      teams: meeting.teams.map((team) =>
        team.id !== teamId
          ? team
          : {
              ...team,
              metrics: team.metrics.map((metric) =>
                metric.id === metricId
                  ? { ...metric, ...changes, source: 'manual' as const }
                  : metric
              ),
            }
      ),
    });
  };

  const updateBlocker = (blockerId: string, changes: Partial<MeetingBlocker>) => {
    if (!meeting) return;
    applyChange({
      blockers: meeting.blockers.map((blocker) =>
        blocker.id === blockerId ? { ...blocker, ...changes } : blocker
      ),
    });
  };

  const updateInteraction = (interactionId: string, changes: Partial<MeetingInteraction>) => {
    if (!meeting) return;
    applyChange({
      interactions: meeting.interactions.map((interaction) =>
        interaction.id === interactionId ? { ...interaction, ...changes } : interaction
      ),
    });
  };

  const updateAction = (actionId: string, changes: Partial<MeetingAction>) => {
    if (!meeting) return;
    applyChange({
      actions: meeting.actions.map((action) =>
        action.id === actionId ? { ...action, ...changes } : action
      ),
    });
  };

  const updateRetroItem = (column: MeetingRetroColumn, itemId: string, text: string) => {
    if (!meeting) return;
    applyChange({
      retro: {
        ...meeting.retro,
        [column]: meeting.retro[column].map((item) =>
          item.id === itemId ? { ...item, text } : item
        ),
      },
    });
  };

  const openBlockerCount = useMemo(
    () => meeting?.blockers.filter((blocker) => !blocker.resolved).length ?? 0,
    [meeting]
  );

  /* ---------------- rendu ---------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 text-accent-500 animate-spin" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-6 lg:p-8">
        <div className="alert alert-danger">
          <AlertTriangle className="w-5 h-5" />
          <span>{error ?? 'Point hebdo indisponible.'}</span>
        </div>
      </div>
    );
  }

  const phase = MEETING_PHASES[phaseIndex];

  return (
    <div className="pb-24 print:pb-0">
      {/* Console : sprint + minuteur + agenda */}
      <header className="sticky top-0 z-30 bg-surface-900/90 backdrop-blur-xl border-b border-surface-700/60 print:static print:bg-transparent">
        <div className="px-6 lg:px-8 pt-5 pb-3 flex flex-wrap items-start justify-between gap-6">
          <div className="flex-1 min-w-[280px] space-y-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wider text-accent-400 flex items-center gap-1.5 shrink-0">
                <CalendarClock className="w-3.5 h-3.5" /> Point hebdo
              </span>
              <input
                type="date"
                aria-label="Date du point"
                className={`${ghostInputClass} w-32 font-mono text-xs shrink-0`}
                value={meeting.sprint.date}
                onChange={(e) =>
                  applyChange({ sprint: { ...meeting.sprint, date: e.target.value } })
                }
              />
              <span className="inline-flex items-center gap-1 shrink-0">
                <span className="text-xs text-surface-500">Sprint n°</span>
                <input
                  aria-label="Numéro du sprint"
                  className={`${ghostInputClass} w-12 font-mono font-bold text-center`}
                  value={meeting.sprint.number}
                  onChange={(e) =>
                    applyChange({ sprint: { ...meeting.sprint, number: e.target.value } })
                  }
                />
              </span>
            </div>
            <input
              aria-label="Objectif du sprint"
              className={`${ghostInputClass} max-w-xl text-sm text-surface-300`}
              placeholder="Objectif du sprint (une phrase claire, partagée par l'équipe)…"
              value={meeting.sprint.goal}
              onChange={(e) => applyChange({ sprint: { ...meeting.sprint, goal: e.target.value } })}
            />
          </div>

          <div className="flex items-center gap-4 print:hidden">
            <div className="text-right leading-tight">
              <div className="text-[11px] text-surface-400">{phase.label}</div>
              <div
                className={`font-mono text-4xl font-bold tabular-nums ${
                  remaining < 0 ? 'text-danger-400' : 'text-surface-50'
                }`}
                aria-label="Temps restant sur la phase"
              >
                {formatMeetingClock(remaining)}
              </div>
              <div className="font-mono text-[11px] text-surface-500">
                total {formatMeetingClock(elapsed)} / {formatMeetingClock(MEETING_TOTAL_BUDGET_SECONDS)}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRunning((value) => !value)}
                className="btn-primary !px-3 !py-2"
                title={running ? 'Mettre en pause' : 'Démarrer'}
                aria-label={running ? 'Mettre en pause le minuteur' : 'Démarrer le minuteur'}
              >
                {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => goToPhase(phaseIndex + 1)}
                className="btn-secondary !px-3 !py-2 text-xs"
                title="Passer à la phase suivante"
                aria-label="Passer à la phase suivante"
              >
                Phase <ChevronsRight className="w-4 h-4" />
              </button>
              <button
                onClick={resetTimer}
                className="btn-secondary !px-3 !py-2"
                title="Réinitialiser le minuteur"
                aria-label="Réinitialiser le minuteur"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <nav className="flex overflow-x-auto print:hidden">
          {MEETING_PHASES.map((item, index) => (
            <button
              key={item.id}
              onClick={() => goToPhase(index)}
              className={`flex-1 min-w-[150px] text-left px-4 py-2.5 border-t-2 transition-colors ${
                index === phaseIndex
                  ? 'border-accent-500 bg-surface-800/70 text-surface-50'
                  : 'border-transparent text-surface-400 hover:text-surface-200 hover:bg-surface-800/40'
              }`}
            >
              <span className="block font-mono text-[10px] opacity-70">Phase {index + 1}</span>
              <span className="block text-[13px] font-semibold">{item.label}</span>
              <span className="block font-mono text-[10px]">{item.budgetMinutes} min</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 lg:px-8 py-8 space-y-10">
        {error && (
          <div className="alert alert-warning print:hidden">
            <AlertTriangle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Phase 1 — chiffres */}
        <section id="phase-chiffres" className="scroll-mt-44">
          <SectionHead title="Avancée du sprint — les chiffres" budget="20 min">
            <button
              onClick={() => void prefillFromJira(meeting.teams)}
              disabled={prefilling || boards.length === 0}
              className="btn-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
              title={
                boards.length === 0
                  ? 'Aucun board Jira configuré'
                  : 'Remplit les indicateurs encore vides avec les chiffres du sprint en cours (les valeurs saisies à la main sont conservées)'
              }
            >
              {prefilling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-accent-400" />
              )}
              Préremplir depuis Jira
            </button>
            <button
              onClick={() => applyChange({ teams: [...meeting.teams, createTeam('dev')] })}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5 text-accent-400" /> Ajouter une équipe
            </button>
          </SectionHead>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {meeting.teams.map((team) => (
              <article key={team.id} className="card-glass p-4 flex flex-col print:break-inside-avoid">
                <div className="flex items-center gap-2 mb-3">
                  <select
                    aria-label="Type d'équipe"
                    className="bg-surface-800 border border-surface-700 rounded-md text-[11px] px-1.5 py-1 text-surface-200"
                    value={team.role}
                    onChange={(e) => updateTeam(team.id, { role: e.target.value as MeetingTeamRole })}
                  >
                    <option value="dev">Dev</option>
                    <option value="qa">QA</option>
                  </select>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                      team.role === 'qa'
                        ? 'text-accent-300 border-accent-500/40 bg-accent-500/10'
                        : 'text-primary-300 border-primary-500/40 bg-primary-500/10'
                    }`}
                  >
                    {team.role.toUpperCase()}
                  </span>
                  {boards.length > 0 ? (
                    <select
                      aria-label="Nom de l'équipe"
                      className="flex-1 bg-surface-800 border border-surface-700 rounded-lg text-sm font-semibold px-2 py-1.5 text-surface-100"
                      value={team.boardId ?? ''}
                      onChange={(e) => {
                        const boardId = e.target.value ? Number(e.target.value) : undefined;
                        const board = boards.find((b) => b.id === boardId);
                        updateTeam(team.id, { boardId, name: board ? board.name : team.name });
                      }}
                    >
                      <option value="">Aucun board Jira associé</option>
                      {boards.map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label="Nom de l'équipe"
                      placeholder="Nom de l'équipe"
                      className={`${ghostInputClass} flex-1 font-semibold`}
                      value={team.name}
                      onChange={(e) => updateTeam(team.id, { name: e.target.value })}
                    />
                  )}
                </div>

                <div className="space-y-1">
                  {team.metrics.map((metric) => {
                    const targetMode = getMetricTargetMode(metric.label);
                    const effectiveTarget =
                      targetMode === 'auto-engaged-points'
                        ? findEngagedPointsValue(team.metrics)
                        : targetMode === 'hidden'
                          ? ''
                          : metric.target;
                    const progress = computeMetricProgress(metric.value, effectiveTarget);
                    const hasLabel = metric.label.trim() !== '';
                    return (
                      <div key={metric.id} className="border-t border-surface-800 first:border-t-0 pt-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            aria-label="Indicateur"
                            placeholder="Nom de l'indicateur"
                            title={
                              hasLabel
                                ? undefined
                                : `Indicateur sans nom : impossible de savoir à quoi correspond la valeur ${
                                    metric.value || '?'
                                  }`
                            }
                            className={`w-28 shrink-0 truncate bg-transparent border rounded-lg px-2 py-1 text-[13px] font-semibold focus:outline-none focus:border-accent-500 transition-colors ${
                              hasLabel
                                ? 'border-surface-700/70 text-surface-200'
                                : 'border-warning-500/50 bg-warning-500/10 placeholder-warning-300'
                            }`}
                            value={metric.label}
                            onChange={(e) => updateMetric(team.id, metric.id, { label: e.target.value })}
                          />
                          <input
                            aria-label={`Valeur — ${metric.label}`}
                            inputMode="decimal"
                            className={`${ghostInputClass} w-14 font-mono font-bold text-right ${
                              metric.source === 'jira' ? 'text-accent-300' : ''
                            }`}
                            value={metric.value}
                            onChange={(e) => updateMetric(team.id, metric.id, { value: e.target.value })}
                          />
                          {targetMode !== 'hidden' && (
                            <>
                              <span className="text-surface-600 font-mono text-xs">/</span>
                              {targetMode === 'auto-engaged-points' ? (
                                <span
                                  aria-label={`Cible — ${metric.label} (= Points engagés)`}
                                  title="Cible = valeur de l'indicateur « Points engagés » de l'équipe"
                                  className="w-14 font-mono text-xs text-surface-500 text-right px-2 py-1"
                                >
                                  {effectiveTarget || '—'}
                                </span>
                              ) : (
                                <input
                                  aria-label={`Cible — ${metric.label}`}
                                  inputMode="decimal"
                                  placeholder="cible"
                                  className={`${ghostInputClass} w-14 font-mono text-xs text-surface-400`}
                                  value={metric.target}
                                  onChange={(e) => updateMetric(team.id, metric.id, { target: e.target.value })}
                                />
                              )}
                            </>
                          )}
                          <button
                            onClick={() =>
                              updateTeam(team.id, {
                                metrics: team.metrics.filter((m) => m.id !== metric.id),
                              })
                            }
                            className="text-surface-600 hover:text-danger-400 transition-colors print:hidden"
                            title="Supprimer l'indicateur"
                            aria-label={`Supprimer ${metric.label}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {progress != null && (
                          <div className="h-1 bg-surface-800 rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-accent-500 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 print:hidden">
                  <button
                    onClick={() =>
                      updateTeam(team.id, { metrics: [...team.metrics, createMetric()] })
                    }
                    className="text-xs font-semibold text-accent-400 hover:text-accent-300"
                  >
                    + indicateur
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Retirer cette équipe et ses chiffres ?')) {
                        applyChange({ teams: meeting.teams.filter((t) => t.id !== team.id) });
                      }
                    }}
                    className="text-xs text-surface-500 hover:text-danger-400"
                  >
                    Retirer cette équipe
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Phase 2 — blocages */}
        <section id="phase-blocages" className="scroll-mt-44">
          <SectionHead
            title="Points bloquants"
            budget="15 min"
            badge={openBlockerCount > 0 ? `${openBlockerCount} en cours` : undefined}
          >
            <button
              onClick={() => applyChange({ blockers: [...meeting.blockers, createBlocker()] })}
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5 text-accent-400" /> Ajouter un blocage
            </button>
          </SectionHead>

          {meeting.blockers.length === 0 ? (
            <EmptyState>
              Aucun blocage listé. Dès qu'un lead signale un point qui freine, ajoutez-le ici avec ce
              qu'il faut pour le lever.
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {meeting.blockers.map((blocker) => (
                <div
                  key={blocker.id}
                  className={`card-glass p-3 grid gap-3 items-start lg:grid-cols-[130px_1fr_1fr_150px_auto] print:break-inside-avoid ${
                    blocker.resolved ? 'opacity-60' : ''
                  }`}
                >
                  <select
                    aria-label="Sévérité"
                    className={`rounded-lg border px-2 py-1.5 text-xs font-bold ${SEVERITY_STYLES[blocker.severity]}`}
                    value={blocker.severity}
                    onChange={(e) =>
                      updateBlocker(blocker.id, {
                        severity: e.target.value as MeetingBlockerSeverity,
                      })
                    }
                  >
                    {MEETING_BLOCKER_SEVERITIES.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                  <Field label="Blocage">
                    <textarea
                      className={`${inputClass} min-h-[38px] resize-y ${
                        blocker.resolved ? 'line-through' : ''
                      }`}
                      placeholder="Qu'est-ce qui bloque ?"
                      value={blocker.text}
                      onChange={(e) => updateBlocker(blocker.id, { text: e.target.value })}
                    />
                  </Field>
                  <Field label="Ce qu'il faut pour le lever">
                    <textarea
                      className={`${inputClass} min-h-[38px] resize-y`}
                      placeholder="Décision, ressource, dépendance…"
                      value={blocker.need}
                      onChange={(e) => updateBlocker(blocker.id, { need: e.target.value })}
                    />
                  </Field>
                  <Field label="Responsable">
                    <input
                      className={inputClass}
                      placeholder="Qui suit ?"
                      value={blocker.owner}
                      onChange={(e) => updateBlocker(blocker.id, { owner: e.target.value })}
                    />
                  </Field>
                  <div className="flex items-center gap-2 pt-5">
                    <label className="flex items-center gap-1.5 text-xs text-surface-400">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-emerald-500"
                        checked={blocker.resolved}
                        onChange={(e) => updateBlocker(blocker.id, { resolved: e.target.checked })}
                      />
                      Levé
                    </label>
                    <button
                      onClick={() =>
                        applyChange({
                          blockers: meeting.blockers.filter((b) => b.id !== blocker.id),
                        })
                      }
                      className="text-surface-600 hover:text-danger-400 print:hidden"
                      aria-label="Supprimer le blocage"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Phase 3 — interactions */}
        <section id="phase-interactions" className="scroll-mt-44">
          <SectionHead title="Interactions entre équipes" budget="10 min">
            <button
              onClick={() =>
                applyChange({ interactions: [...meeting.interactions, createInteraction()] })
              }
              className="btn-secondary !py-1.5 !px-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5 text-accent-400" /> Ajouter une interaction
            </button>
          </SectionHead>

          {meeting.interactions.length === 0 ? (
            <EmptyState>
              Aucune interaction notée. Utilisez cette zone pour les dépendances et passages de
              relais entre Dev et QA (attentes, environnements, specs, retours…).
            </EmptyState>
          ) : (
            <div className="space-y-2">
              {meeting.interactions.map((interaction) => (
                <div
                  key={interaction.id}
                  className="card-glass p-3 grid gap-3 items-start lg:grid-cols-[220px_1fr_140px_auto] print:break-inside-avoid"
                >
                  <Field label="De → vers">
                    <div className="flex items-center gap-1.5">
                      <input
                        className={inputClass}
                        placeholder="Dev"
                        value={interaction.from}
                        onChange={(e) => updateInteraction(interaction.id, { from: e.target.value })}
                      />
                      <ArrowRight className="w-4 h-4 text-surface-500 shrink-0" />
                      <input
                        className={inputClass}
                        placeholder="QA"
                        value={interaction.to}
                        onChange={(e) => updateInteraction(interaction.id, { to: e.target.value })}
                      />
                    </div>
                  </Field>
                  <Field label="Sujet & action attendue">
                    <textarea
                      className={`${inputClass} min-h-[38px] resize-y`}
                      placeholder="Ex : QA en attente du build sur l'env. de recette"
                      value={interaction.subject}
                      onChange={(e) =>
                        updateInteraction(interaction.id, { subject: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Statut">
                    <select
                      className={inputClass}
                      value={interaction.status}
                      onChange={(e) =>
                        updateInteraction(interaction.id, {
                          status: e.target.value as MeetingInteractionStatus,
                        })
                      }
                    >
                      {MEETING_INTERACTION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button
                    onClick={() =>
                      applyChange({
                        interactions: meeting.interactions.filter((i) => i.id !== interaction.id),
                      })
                    }
                    className="mt-5 text-surface-600 hover:text-danger-400 print:hidden"
                    aria-label="Supprimer l'interaction"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Phase 4 — amélioration continue */}
        <section id="phase-amelioration" className="scroll-mt-44">
          <SectionHead title="Amélioration continue" budget="15 min" />

          <div className="grid gap-4 md:grid-cols-3">
            {RETRO_COLUMNS.map((column) => (
              <div key={column.key} className="card-glass overflow-hidden flex flex-col print:break-inside-avoid">
                <div className="px-4 py-2.5 border-b border-surface-700/60 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${RETRO_DOT_STYLES[column.key]}`} />
                  <span className="text-sm font-semibold">{column.title}</span>
                  <span className="text-xs text-surface-500">· {column.hint}</span>
                </div>
                <div className="p-3 space-y-2 min-h-[80px]">
                  {meeting.retro[column.key].map((item) => (
                    <div key={item.id} className="flex gap-1.5">
                      <textarea
                        className={`${inputClass} min-h-[34px] resize-y`}
                        value={item.text}
                        onChange={(e) => updateRetroItem(column.key, item.id, e.target.value)}
                      />
                      <button
                        onClick={() =>
                          applyChange({
                            retro: {
                              ...meeting.retro,
                              [column.key]: meeting.retro[column.key].filter(
                                (entry) => entry.id !== item.id
                              ),
                            },
                          })
                        }
                        className="text-surface-600 hover:text-danger-400 print:hidden"
                        aria-label="Supprimer l'élément"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() =>
                    applyChange({
                      retro: {
                        ...meeting.retro,
                        [column.key]: [...meeting.retro[column.key], createRetroItem()],
                      },
                    })
                  }
                  className="m-3 mt-0 border border-dashed border-surface-700 rounded-lg py-1.5 text-xs font-semibold text-surface-400 hover:border-accent-500 hover:text-accent-400 transition-colors print:hidden"
                >
                  + ajouter
                </button>
              </div>
            ))}
          </div>

          <div className="card-glass mt-4 overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_160px_140px_130px_auto] gap-3 px-4 py-2 bg-surface-800/60 text-[11px] font-semibold text-surface-400">
              <span>Action décidée</span>
              <span>Responsable</span>
              <span>Échéance</span>
              <span>Statut</span>
              <span />
            </div>
            {meeting.actions.length === 0 ? (
              <p className="px-4 py-4 text-sm text-surface-500">
                Les actions décidées ici sont reconduites automatiquement au prochain point tant
                qu'elles ne sont pas « Fait ».
              </p>
            ) : (
              meeting.actions.map((action) => (
                <div
                  key={action.id}
                  className="grid gap-3 md:grid-cols-[1fr_160px_140px_130px_auto] px-4 py-2 border-t border-surface-800 items-center"
                >
                  <input
                    aria-label="Action décidée"
                    className={inputClass}
                    placeholder="Action concrète"
                    value={action.text}
                    onChange={(e) => updateAction(action.id, { text: e.target.value })}
                  />
                  <input
                    aria-label="Responsable de l'action"
                    className={inputClass}
                    placeholder="Responsable"
                    value={action.owner}
                    onChange={(e) => updateAction(action.id, { owner: e.target.value })}
                  />
                  <input
                    aria-label="Échéance"
                    type="date"
                    className={inputClass}
                    value={action.due}
                    onChange={(e) => updateAction(action.id, { due: e.target.value })}
                  />
                  <select
                    aria-label="Statut de l'action"
                    className={`${inputClass} ${ACTION_STATUS_STYLES[action.status]}`}
                    value={action.status}
                    onChange={(e) =>
                      updateAction(action.id, { status: e.target.value as MeetingActionStatus })
                    }
                  >
                    {MEETING_ACTION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      applyChange({ actions: meeting.actions.filter((a) => a.id !== action.id) })
                    }
                    className="text-surface-600 hover:text-danger-400 print:hidden"
                    aria-label="Supprimer l'action"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
            <button
              onClick={() => applyChange({ actions: [...meeting.actions, createAction()] })}
              className="w-full border-t border-surface-700/60 py-2.5 text-sm font-semibold text-accent-400 hover:bg-accent-500/10 transition-colors print:hidden"
            >
              + Ajouter une action
            </button>
          </div>
        </section>
      </main>

      {/* Barre d'outils */}
      <div className="fixed bottom-0 left-64 right-0 z-40 bg-surface-900/95 backdrop-blur-xl border-t border-surface-700/60 px-6 py-2.5 flex items-center gap-3 print:hidden">
        <SaveIndicator state={saveState} />
        <span className="flex-1" />
        <button onClick={openHistory} className="btn-secondary !py-1.5 !px-3 text-xs">
          <History className="w-3.5 h-3.5" /> Historique
        </button>
        <button onClick={copyReport} className="btn-secondary !py-1.5 !px-3 text-xs">
          {copied ? (
            <Check className="w-3.5 h-3.5 text-success-400" />
          ) : (
            <ClipboardCopy className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copié' : 'Copier le compte-rendu'}
        </button>
        <button onClick={() => window.print()} className="btn-secondary !py-1.5 !px-3 text-xs">
          <Printer className="w-3.5 h-3.5" /> Imprimer / PDF
        </button>
        <button onClick={startNextMeeting} className="btn-primary !py-1.5 !px-3 text-xs">
          <Target className="w-3.5 h-3.5" /> Nouveau point
        </button>
      </div>

      {showHistory && (
        <Modal title="Historique des points" onClose={() => setShowHistory(false)}>
          {history.length === 0 ? (
            <p className="text-sm text-surface-400">Aucun point enregistré.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => openMeeting(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      item.id === meeting.id
                        ? 'border-accent-500/50 bg-accent-500/10'
                        : 'border-surface-700 hover:border-accent-500/50 hover:bg-surface-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-sm">
                        {item.sprint.name} n°{item.sprint.number}
                      </span>
                      <span className="font-mono text-xs text-surface-400">{item.sprint.date}</span>
                    </div>
                    <div className="text-xs text-surface-500 mt-0.5">
                      {item.summary.teamCount} équipe(s) · {item.summary.openBlockerCount} blocage(s)
                      ouvert(s) · {item.summary.openActionCount} action(s) en cours
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {reportText && (
        <Modal title="Compte-rendu" onClose={() => setReportText(null)}>
          <p className="text-sm text-surface-400 mb-3">
            La copie automatique est bloquée par le navigateur. Sélectionnez le texte puis
            Ctrl/Cmd + C.
          </p>
          <textarea
            readOnly
            className={`${inputClass} font-mono text-xs min-h-[320px]`}
            value={reportText}
          />
        </Modal>
      )}
    </div>
  );
}

function SectionHead({
  title,
  budget,
  badge,
  children,
}: {
  title: string;
  budget: string;
  badge?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-3 mb-4">
      <h2 className="text-lg font-bold">{title}</h2>
      <span className="font-mono text-[11px] text-surface-400 border border-surface-700 rounded-full px-2 py-0.5">
        {budget}
      </span>
      {badge && <span className="badge badge-warning">{badge}</span>}
      <span className="flex-1" />
      <div className="flex gap-2 print:hidden">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-surface-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-surface-700 rounded-xl p-5 text-center text-sm text-surface-400 bg-surface-900/40">
      {children}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'error') {
    return (
      <span className="flex items-center gap-2 text-xs text-danger-400">
        <CloudOff className="w-4 h-4" /> Enregistrement impossible
      </span>
    );
  }
  if (state === 'pending') {
    return (
      <span className="flex items-center gap-2 text-xs text-warning-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-surface-400">
      <Cloud className="w-4 h-4 text-success-400" />
      {state === 'saved' ? 'Sauvegardé' : 'Sauvegarde auto'}
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:hidden"
      onClick={onClose}
    >
      <div
        className="card-glass w-full max-w-2xl max-h-[80vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-100"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
