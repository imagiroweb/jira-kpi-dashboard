import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DateRangePicker } from './DateRangePicker';
import { ProjectSelector } from './ProjectSelector';
import { UserWorkloadChart } from './UserWorkloadChart';
import { UserTicketsChart } from './UserTicketsChart';
import { Users, PlayCircle, CheckCircle, CalendarDays } from 'lucide-react';
import { useStore } from '../store/useStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export function UserDetailPage() {
  const dateRange = useStore((state) => state.dateRange);
  const setDateRange = useStore((state) => state.setDateRange);
  const selectedProjects = useStore((state) => state.selectedProjects);
  const setSelectedProjects = useStore((state) => state.setSelectedProjects);

  const usersPageUseActiveSprint = useStore((state) => state.usersPageUseActiveSprint);
  const setUsersPageUseActiveSprint = useStore((state) => state.setUsersPageUseActiveSprint);
  const usersReportPayload = useStore((state) => state.usersReportPayload);
  const setUsersReportPayload = useStore((state) => state.setUsersReportPayload);
  const setUsersReportLastUpdate = useStore((state) => state.setUsersReportLastUpdate);
  const setUsersLastFiltersKey = useStore((state) => state.setUsersLastFiltersKey);
  const kpiRefreshTrigger = useStore((state) => state.kpiRefreshTrigger);
  const usersReportLastUpdate = useStore((state) => state.usersReportLastUpdate);

  const [reportLoading, setReportLoading] = useState(false);

  /** Au moins un projet doit être sélectionné — sinon aucune requête (pas de fallback « tous » / AD côté API) */
  const filtersKey = useMemo(() => {
    const proj =
      selectedProjects.length > 0
        ? [...selectedProjects].sort().join(',')
        : 'none';
    return `${dateRange.from}|${dateRange.to}|${usersPageUseActiveSprint}|${proj}`;
  }, [dateRange.from, dateRange.to, usersPageUseActiveSprint, selectedProjects]);

  const filtersKeyRef = useRef(filtersKey);
  filtersKeyRef.current = filtersKey;

  const fetchUsersReport = useCallback(
    async (silent = false) => {
      const { dateRange: dr, selectedProjects: sp, usersPageUseActiveSprint: active } = useStore.getState();
      if (sp.length === 0) {
        return;
      }

      if (!silent) {
        setReportLoading(true);
        setUsersReportPayload(null);
      }
      try {
        const params = new URLSearchParams();
        if (active) {
          params.append('activeSprint', 'true');
        } else {
          params.append('from', dr.from);
          params.append('to', dr.to);
        }
        params.append('groupBy', 'user');
        params.append('projectKeys', sp.join(','));

        const response = await fetch(`${API_BASE_URL}/worklog/report?${params}`);

        if (response.status === 429) {
          return;
        }
        if (!response.ok) {
          if (!silent) setUsersReportPayload(null);
          return;
        }

        const result = await response.json();
        if (result.success) {
          if (useStore.getState().selectedProjects.length === 0) {
            return;
          }
          setUsersReportPayload(result);
          setUsersReportLastUpdate(new Date());
          const key = filtersKeyRef.current;
          if (key) setUsersLastFiltersKey(key);
        }
      } catch (e) {
        console.error('Failed to fetch users report:', e);
        if (!silent) setUsersReportPayload(null);
      } finally {
        if (!silent) setReportLoading(false);
      }
    },
    [setUsersReportPayload, setUsersReportLastUpdate, setUsersLastFiltersKey]
  );

  useEffect(() => {
    if (selectedProjects.length === 0) {
      setUsersReportPayload(null);
      setUsersLastFiltersKey(null);
      setUsersReportLastUpdate(null);
    }
  }, [
    selectedProjects.length,
    setUsersReportPayload,
    setUsersLastFiltersKey,
    setUsersReportLastUpdate
  ]);

  useEffect(() => {
    if (!filtersKey) return;
    if (selectedProjects.length === 0) return;
    const { usersLastFiltersKey: lastKey, usersReportPayload: cached } = useStore.getState();
    if (lastKey === filtersKey && cached != null) {
      return;
    }
    fetchUsersReport(false);
  }, [filtersKey, fetchUsersReport, selectedProjects.length]);

  useEffect(() => {
    if (kpiRefreshTrigger <= 0) return;
    if (selectedProjects.length === 0) return;
    fetchUsersReport(true);
  }, [kpiRefreshTrigger, fetchUsersReport, selectedProjects.length]);

  const handleDateChange = useCallback(
    (newDateRange: { from: string; to: string }) => {
      setDateRange(newDateRange);
      setUsersPageUseActiveSprint(false);
    },
    [setDateRange, setUsersPageUseActiveSprint]
  );

  const handleActiveSprintClick = useCallback(() => {
    setUsersPageUseActiveSprint(true);
  }, [setUsersPageUseActiveSprint]);

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold gradient-text mb-1">Détail Utilisateurs</h1>
              <p className="text-surface-400">Temps passé et tickets par utilisateur</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ProjectSelector value={selectedProjects} onChange={setSelectedProjects} />
            <DateRangePicker value={dateRange} onChange={handleDateChange} />
            <button
              onClick={handleActiveSprintClick}
              className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                usersPageUseActiveSprint
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                  : 'bg-surface-800 hover:bg-surface-700 text-surface-300 border border-surface-600'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              Sprint actif
              {usersPageUseActiveSprint && <CheckCircle className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-surface-500">
          {usersPageUseActiveSprint ? (
            <span className="text-primary-400 flex items-center gap-1">
              <PlayCircle className="w-3 h-3" />
              Mode: Période du sprint actif (worklogDate)
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              Mode: Période personnalisée ({dateRange.from} → {dateRange.to})
            </span>
          )}
          {usersReportLastUpdate && (
            <span className="text-surface-600">
              Mise à jour : {usersReportLastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <UserWorkloadChart
            dateRange={dateRange}
            selectedProjects={selectedProjects}
            useActiveSprint={usersPageUseActiveSprint}
            sharedReportPayload={usersReportPayload}
            isSharedReportLoading={reportLoading}
          />
        </div>
        <div className="space-y-6">
          <UserTicketsChart
            dateRange={dateRange}
            selectedProjects={selectedProjects}
            useActiveSprint={usersPageUseActiveSprint}
            sharedReportPayload={usersReportPayload}
            isSharedReportLoading={reportLoading}
          />
        </div>
      </section>
    </div>
  );
}
