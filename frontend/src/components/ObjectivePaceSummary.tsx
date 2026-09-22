import {
  CoachingAudience,
  CoachingStatus,
  ObjectiveCoachingSnapshot,
  PERFORMANCE_CYCLE_MONTHS,
  COACHING_STATUS_BADGE_CLASS,
  coachingStatusLabel,
  cycleMonthCheckpoints,
  formatWeightedScore
} from '../domain/performance';

export function CoachingStatusBadge({
  status,
  audience = 'manager'
}: {
  status: CoachingStatus;
  audience?: CoachingAudience;
}) {
  return (
    <span className={`badge ${COACHING_STATUS_BADGE_CLASS[status]}`}>
      {coachingStatusLabel(status, audience)}
    </span>
  );
}

export function CoachingActionNote({
  action,
  audience = 'manager'
}: {
  action?: string;
  audience?: CoachingAudience;
}) {
  if (!action?.trim()) return null;
  return (
    <p
      className={`text-sm rounded-lg px-3 py-2 ${
        audience === 'self'
          ? 'bg-danger-500/10 text-danger-300'
          : 'bg-surface-800/80 text-surface-300'
      }`}
    >
      <span className="font-medium">{audience === 'self' ? 'Action à suivre : ' : 'Action demandée : '}</span>
      {action.trim()}
    </p>
  );
}

function formatMonths(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

function CycleMonthTrack({
  progress,
  expectedProgress,
  monthIndex
}: {
  progress: number;
  expectedProgress: number;
  monthIndex: number;
}) {
  const checkpoints = cycleMonthCheckpoints();

  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 rounded-full bg-surface-800 overflow-hidden">
        <div
          className="h-full bg-primary-500"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-accent-300"
          style={{ left: `${Math.min(100, Math.max(0, expectedProgress))}%` }}
          title={`Attendu ${Math.round(expectedProgress)}%`}
        />
      </div>
      <div className="grid grid-cols-6 gap-1">
        {checkpoints.map((checkpoint, index) => {
          const month = index + 1;
          const reached = progress + 0.001 >= checkpoint;
          const isCurrent = month === monthIndex;
          return (
            <div
              key={month}
              className={`rounded-md px-1 py-0.5 text-center text-[10px] leading-tight ${
                isCurrent
                  ? 'bg-accent-500/20 text-accent-300'
                  : reached
                    ? 'bg-success-500/10 text-success-400'
                    : 'bg-surface-800/80 text-surface-500'
              }`}
            >
              M{month}
              <span className="block">{Math.round(checkpoint)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ObjectivePaceSummaryProps {
  coaching: ObjectiveCoachingSnapshot;
  /** Compact : badges + barre uniquement (liste / en-tête). */
  compact?: boolean;
  title?: string;
  /** self = libellés collaborateur ("Action requise") ; manager = libellés lead. */
  audience?: CoachingAudience;
  /** Action d'accompagnement renseignée par le manager. */
  coachingAction?: string;
}

/**
 * Score pondéré + statut d'accompagnement vs la courbe linéaire à 6 mois.
 * Utilisé sur chaque objectif et sur l'avancement total de la fiche.
 */
export function ObjectivePaceSummary({
  coaching,
  compact = false,
  title,
  audience = 'manager',
  coachingAction
}: ObjectivePaceSummaryProps) {
  const expectedLabel = `${Math.round(coaching.expectedProgress)}%`;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {title && <span className="text-sm text-surface-300">{title}</span>}
          <span className="badge badge-info">
            Score pondéré {formatWeightedScore(coaching.weightedScore, coaching.weight)}
          </span>
          <CoachingStatusBadge status={coaching.status} audience={audience} />
          <span className="text-xs text-surface-500">
            Attendu {expectedLabel} · {formatMonths(coaching.remainingMonths)} mois restants
          </span>
        </div>
        <CoachingActionNote action={coachingAction} audience={audience} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && <p className="text-sm font-medium text-surface-200">{title}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-surface-400">
        <span>
          Avancement {Math.round(coaching.progress)}% · Score pondéré{' '}
          {formatWeightedScore(coaching.weightedScore, coaching.weight)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <CoachingStatusBadge status={coaching.status} audience={audience} />
          <span>
            Attendu {expectedLabel} (M{coaching.monthIndex}/{PERFORMANCE_CYCLE_MONTHS}) ·{' '}
            {formatMonths(coaching.remainingMonths)} mois restants
          </span>
        </div>
      </div>
      <CycleMonthTrack
        progress={coaching.progress}
        expectedProgress={coaching.expectedProgress}
        monthIndex={coaching.monthIndex}
      />
      <CoachingActionNote action={coachingAction} audience={audience} />
    </div>
  );
}
