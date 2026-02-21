import { useState, useCallback } from 'react';
import { DateRangePicker } from './DateRangePicker';
import { ProjectSelector } from './ProjectSelector';
import { UserWorkloadChart } from './UserWorkloadChart';
import { UserTicketsChart } from './UserTicketsChart';
import { Users, PlayCircle, CheckCircle, CalendarDays } from 'lucide-react';
import { useStore } from '../store/useStore';

export function UserDetailPage() {
  // Use global store for shared state
  const dateRange = useStore((state) => state.dateRange);
  const setDateRange = useStore((state) => state.setDateRange);
  const selectedProjects = useStore((state) => state.selectedProjects);
  const setSelectedProjects = useStore((state) => state.setSelectedProjects);
  
  // Mode sprint actif par défaut
  const [useActiveSprint, setUseActiveSprint] = useState(true);
  
  // Quand on change les dates, on désactive le mode sprint actif
  const handleDateChange = useCallback((newDateRange: { from: string; to: string }) => {
    setDateRange(newDateRange);
    setUseActiveSprint(false);
  }, [setDateRange]);
  
  // Revenir au sprint actif
  const handleActiveSprintClick = useCallback(() => {
    setUseActiveSprint(true);
  }, []);

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold gradient-text mb-1">
                Détail Utilisateurs
              </h1>
              <p className="text-surface-400">
                Temps passé et tickets par utilisateur
              </p>
            </div>
          </div>
          
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <ProjectSelector
              value={selectedProjects}
              onChange={setSelectedProjects}
            />
            <DateRangePicker 
              value={dateRange}
              onChange={handleDateChange}
            />
            <button
              onClick={handleActiveSprintClick}
              className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                useActiveSprint
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                  : 'bg-surface-800 hover:bg-surface-700 text-surface-300 border border-surface-600'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              Sprint actif
              {useActiveSprint && <CheckCircle className="w-3 h-3" />}
            </button>
          </div>
        </div>
        
        {/* Mode indicator */}
        <div className="mt-2">
          {useActiveSprint ? (
            <span className="text-xs text-primary-400 flex items-center gap-1">
              <PlayCircle className="w-3 h-3" />
              Mode: Sprint actif (openSprints)
            </span>
          ) : (
            <span className="text-xs text-surface-400 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" />
              Mode: Période personnalisée ({dateRange.from} → {dateRange.to})
            </span>
          )}
        </div>
      </header>

      {/* Main Content - Side by Side */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* User Workload - Left side */}
        <div className="space-y-6">
          <UserWorkloadChart
            dateRange={dateRange}
            selectedProjects={selectedProjects}
            useActiveSprint={useActiveSprint}
          />
        </div>
        
        {/* User Tickets - Right side */}
        <div className="space-y-6">
          <UserTicketsChart
            dateRange={dateRange}
            selectedProjects={selectedProjects}
            useActiveSprint={useActiveSprint}
          />
        </div>
      </section>
    </div>
  );
}
