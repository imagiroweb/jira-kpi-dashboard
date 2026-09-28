import { useEffect, useState } from 'react';
import { Archive, Loader2, Save } from 'lucide-react';
import { organizationApi, RetentionSettings } from '../services/api';

type FieldKey = keyof RetentionSettings;

const FIELDS: Array<{ key: FieldKey; label: string; unit: string; help: string; max: number }> = [
  {
    key: 'activityLogMonths',
    label: 'Logs d’activité (connexions, pages vues)',
    unit: 'mois',
    help: 'Supprimés automatiquement au-delà de cette durée.',
    max: 120
  },
  {
    key: 'performanceReviewYears',
    label: 'Fiches de performance',
    unit: 'années après la fin du cycle',
    help: 'Anonymisées à l’échéance : textes libres effacés, lien au collaborateur rompu, statistiques conservées.',
    max: 50
  },
  {
    key: 'inactiveAccountMonths',
    label: 'Comptes désactivés',
    unit: 'mois après désactivation',
    help: 'Le compte est anonymisé (plus aucune donnée personnelle).',
    max: 120
  }
];

function toInput(value: number | null): string {
  return value === null ? '' : String(value);
}

/**
 * Durées de conservation de l'organisation (RGPD) : un champ vide = pas de purge automatique.
 * La purge s'exécute une fois par jour côté serveur.
 */
export function RetentionSettingsPanel() {
  const [values, setValues] = useState<Record<FieldKey, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    organizationApi
      .getMine()
      .then((org) =>
        setValues({
          activityLogMonths: toInput(org.retention.activityLogMonths),
          performanceReviewYears: toInput(org.retention.performanceReviewYears),
          inactiveAccountMonths: toInput(org.retention.inactiveAccountMonths)
        })
      )
      .catch(() => setMessage({ kind: 'error', text: 'Impossible de charger les durées de conservation' }));
  }, []);

  const handleSave = async () => {
    if (!values) return;
    const payload: Partial<RetentionSettings> = {};
    for (const { key } of FIELDS) {
      const raw = values[key].trim();
      payload[key] = raw === '' ? null : Number(raw);
    }
    setSaving(true);
    setMessage(null);
    try {
      await organizationApi.updateRetention(payload);
      setMessage({ kind: 'ok', text: 'Durées de conservation enregistrées.' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { errors?: string[]; error?: string } } };
      setMessage({ kind: 'error', text: err.response?.data?.errors?.join(' ; ') || err.response?.data?.error || 'Erreur d’enregistrement' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-surface-700/50 bg-surface-900/50 p-5 space-y-4">
      <p className="text-sm text-surface-400 flex items-center gap-2">
        <Archive className="w-4 h-4 text-emerald-400" />
        Durées de conservation (RGPD). Laissez vide pour ne pas purger automatiquement — à fixer avec les RH / le DPO.
      </p>
      {!values ? (
        <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-sm text-surface-200 mb-1">{f.label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={f.max}
                  step={1}
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  aria-label={f.label}
                  placeholder="—"
                  className="input w-24"
                />
                <span className="text-xs text-surface-500">{f.unit}</span>
              </div>
              <span className="block text-xs text-surface-500 mt-1">{f.help}</span>
            </label>
          ))}
        </div>
      )}
      {message && <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={() => void handleSave()} disabled={!values || saving} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
      </div>
    </div>
  );
}
