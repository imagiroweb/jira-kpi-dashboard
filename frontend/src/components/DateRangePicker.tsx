import { useState, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { formatDate, type DateRange } from '../utils/dateUtils';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

// Preset ranges
const presets = [
  { label: '7 derniers jours', days: 7 },
  { label: '14 derniers jours', days: 14 },
  { label: '30 derniers jours', days: 30 },
  { label: '90 derniers jours', days: 90 },
  { label: 'Ce mois', type: 'month' as const },
  { label: 'Ce trimestre', type: 'quarter' as const },
];

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(value.from);
  const [localTo, setLocalTo] = useState(value.to);

  useEffect(() => {
    setLocalFrom(value.from);
    setLocalTo(value.to);
  }, [value]);

  const handleApply = () => {
    onChange({ from: localFrom, to: localTo });
    setIsOpen(false);
  };

  const handlePreset = (preset: typeof presets[number]) => {
    const today = new Date();
    let from: Date;
    
    if ('days' in preset && preset.days !== undefined) {
      from = new Date(today);
      from.setDate(from.getDate() - preset.days);
    } else if (preset.type === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
      // Quarter
      const quarter = Math.floor(today.getMonth() / 3);
      from = new Date(today.getFullYear(), quarter * 3, 1);
    }

    const newRange = { from: formatDate(from), to: formatDate(today) };
    setLocalFrom(newRange.from);
    setLocalTo(newRange.to);
    onChange(newRange);
    setIsOpen(false);
  };

  // Format display label
  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded-lg text-surface-200 transition-colors"
      >
        <Calendar className="w-4 h-4 text-primary-400" />
        <span className="text-sm font-medium">
          {formatDisplayDate(value.from)} - {formatDisplayDate(value.to)}
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
          <div className="absolute right-0 mt-2 z-50 bg-surface-800 border border-surface-600 rounded-xl shadow-xl p-4 min-w-[320px]">
            {/* Presets */}
            <div className="mb-4">
              <p className="text-xs text-surface-500 uppercase tracking-wider mb-2">Raccourcis</p>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    className="px-3 py-1.5 text-xs text-surface-300 hover:text-white bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors text-left"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-surface-700 my-4" />

            {/* Custom Range */}
            <div className="space-y-3">
              <p className="text-xs text-surface-500 uppercase tracking-wider">Plage personnalisée</p>
              
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-surface-400 mb-1">De</label>
                  <input
                    type="date"
                    value={localFrom}
                    onChange={(e) => setLocalFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-sm text-surface-200 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-surface-400 mb-1">À</label>
                  <input
                    type="date"
                    value={localTo}
                    onChange={(e) => setLocalTo(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-sm text-surface-200 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Apply Button */}
              <button
                onClick={handleApply}
                className="w-full mt-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Appliquer
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
