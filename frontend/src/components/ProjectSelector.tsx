import { useState, useEffect, useCallback } from 'react';
import { FolderKanban, ChevronDown, Check, X } from 'lucide-react';
import { jiraApi } from '../services/api';

interface Project {
  key: string;
  name: string;
  isConfigured?: boolean;
}

interface ProjectSelectorProps {
  value: string[];
  onChange: (projects: string[]) => void;
  className?: string;
}

export function ProjectSelector({ value, onChange, className = '' }: ProjectSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [configuredProjects, setConfiguredProjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Load projects from API
  useEffect(() => {
    const loadProjects = async () => {
      setIsLoading(true);
      try {
        const response = await jiraApi.getProjects();
        console.log('Projects API response:', response);
        
        if (response.success && response.data) {
          setProjects(response.data as Project[]);
          
          // Extract configured projects from response
          const configured = response.configuredProjects || [];
          console.log('Configured projects:', configured);
          setConfiguredProjects(configured);
          
          // If no projects selected, default to configured projects
          if (value.length === 0 && configured.length > 0) {
            onChange(configured);
          }
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, [value.length, onChange]);

  const toggleProject = useCallback((projectKey: string) => {
    if (value.includes(projectKey)) {
      // Remove project
      onChange(value.filter(p => p !== projectKey));
    } else {
      // Add project
      onChange([...value, projectKey]);
    }
  }, [value, onChange]);

  const selectAll = useCallback(() => {
    onChange(projects.map(p => p.key));
  }, [projects, onChange]);

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const resetToDefault = useCallback(() => {
    onChange(configuredProjects);
    setIsOpen(false);
  }, [configuredProjects, onChange]);

  // Filter projects based on search
  const filteredProjects = projects.filter(p => 
    p.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Display label
  const getDisplayLabel = () => {
    if (value.length === 0) {
      return 'Tous les projets';
    }
    if (value.length === 1) {
      return value[0];
    }
    if (value.length === projects.length) {
      return 'Tous les projets';
    }
    return `${value.length} projets`;
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded-lg text-surface-200 transition-colors"
      >
        <FolderKanban className="w-4 h-4 text-accent-400" />
        <span className="text-sm font-medium max-w-[120px] truncate">
          {getDisplayLabel()}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="absolute left-0 mt-2 z-50 bg-surface-800 border border-surface-600 rounded-xl shadow-xl min-w-[280px] max-h-[400px] flex flex-col">
            {/* Header */}
            <div className="p-3 border-b border-surface-700">
              <input
                type="text"
                placeholder="Rechercher un projet..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-sm text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500"
              />
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-700">
              <button
                onClick={selectAll}
                className="text-xs text-primary-400 hover:text-primary-300"
              >
                Tout sélectionner
              </button>
              <span className="text-surface-600">|</span>
              <button
                onClick={clearAll}
                className="text-xs text-surface-400 hover:text-surface-300"
              >
                Effacer
              </button>
              <span className="text-surface-600">|</span>
              <button
                onClick={resetToDefault}
                className="text-xs text-accent-400 hover:text-accent-300"
              >
                Par défaut
              </button>
            </div>

            {/* Projects List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="text-center py-4 text-surface-500">
                  Chargement...
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="text-center py-4 text-surface-500">
                  Aucun projet trouvé
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredProjects.map((project) => {
                    const isSelected = value.includes(project.key);
                    const isDefault = configuredProjects.includes(project.key);
                    
                    return (
                      <button
                        key={project.key}
                        onClick={() => toggleProject(project.key)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                          isSelected 
                            ? 'bg-primary-500/20 text-primary-300' 
                            : 'hover:bg-surface-700 text-surface-300'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected 
                            ? 'bg-primary-500 border-primary-500' 
                            : 'border-surface-500'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        
                        {/* Project Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{project.key}</span>
                            {isDefault && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-accent-500/20 text-accent-400 rounded">
                                .env
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-surface-500 truncate">{project.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-surface-700 flex items-center justify-between">
              <span className="text-xs text-surface-500">
                {value.length} sélectionné{value.length > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Appliquer
              </button>
            </div>
          </div>
        </>
      )}

      {/* Selected Projects Pills (when closed) */}
      {!isOpen && value.length > 0 && value.length <= 3 && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value.map((projectKey) => (
            <span
              key={projectKey}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-700 text-surface-300 rounded text-xs"
            >
              {projectKey}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleProject(projectKey);
                }}
                className="hover:text-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
