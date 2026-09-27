import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Save } from 'lucide-react';
import { authApi, type IntegrationSettings } from '../services/authApi';

function formatIds(ids: number[]): string {
  return ids.join(', ');
}

function parseIds(raw: string): number[] {
  const ids: number[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const id = Number(trimmed);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Réglages Jira / Monday et boards affichés, réservés au super admin.
 * Les jetons déjà enregistrés ne sont pas réaffichés : laisser le champ vide les conserve.
 */
export function IntegrationSettingsPanel() {
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [jiraUrl, setJiraUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraApiToken, setJiraApiToken] = useState('');
  const [mondayApiKey, setMondayApiKey] = useState('');
  const [dashboardBoards, setDashboardBoards] = useState('');
  const [qaBoards, setQaBoards] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getIntegrationSettings()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setJiraUrl(loaded.jiraUrl);
        setJiraEmail(loaded.jiraEmail);
        setDashboardBoards(formatIds(loaded.dashboardBoardIds));
        setQaBoards(formatIds(loaded.qaBoardIds));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Impossible de charger les réglages');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await authApi.saveIntegrationSettings({
        jiraUrl,
        jiraEmail,
        jiraApiToken,
        mondayApiKey,
        dashboardBoardIds: parseIds(dashboardBoards),
        qaBoardIds: parseIds(qaBoards),
      });
      setSettings(saved);
      setJiraApiToken('');
      setMondayApiKey('');
      setDashboardBoards(formatIds(saved.dashboardBoardIds));
      setQaBoards(formatIds(saved.qaBoardIds));
      setMessage('Réglages enregistrés. Les tableaux de bord utilisent ces boards.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur à l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="mb-10 flex items-center gap-2 text-surface-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement des connexions…
      </section>
    );
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-surface-200 mb-1 flex items-center gap-2">
        <KeyRound className="w-5 h-5 text-cyan-400" />
        Connexions et boards
      </h2>
      <p className="text-surface-500 text-sm mb-4">
        Les identifiants de boards saisis ici remplacent les variables d’environnement pour le dashboard
        (Brigade, Supply, Front, …) et le point hebdo. Un jeton laissé vide conserve celui déjà enregistré.
        {settings && !settings.boardsConfigured ? ' Aucune liste n’est encore en base : les valeurs affichées viennent du serveur.' : ''}
      </p>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}
      {message && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
          {message}
        </div>
      )}
      <div className="rounded-xl border border-surface-700/50 bg-surface-900/50 p-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-surface-300">
          URL Jira
          <input
            value={jiraUrl}
            onChange={(e) => setJiraUrl(e.target.value)}
            className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100"
            placeholder="https://exemple.atlassian.net"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-surface-300">
          Email Jira
          <input
            value={jiraEmail}
            onChange={(e) => setJiraEmail(e.target.value)}
            className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100"
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-surface-300">
          Jeton API Jira
          <input
            type="password"
            value={jiraApiToken}
            onChange={(e) => setJiraApiToken(e.target.value)}
            className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100"
            placeholder={settings?.jiraApiTokenSet ? 'Déjà renseigné — laisser vide pour le conserver' : 'Jeton API'}
            autoComplete="new-password"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-surface-300">
          Clé API Monday
          <input
            type="password"
            value={mondayApiKey}
            onChange={(e) => setMondayApiKey(e.target.value)}
            className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100"
            placeholder={settings?.mondayApiKeySet ? 'Déjà renseignée — laisser vide pour la conserver' : 'Clé API'}
            autoComplete="new-password"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-surface-300 sm:col-span-2">
          Boards du dashboard (ids, séparés par des virgules)
          <input
            value={dashboardBoards}
            onChange={(e) => setDashboardBoards(e.target.value)}
            className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100"
            placeholder="810, 843, …"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-surface-300 sm:col-span-2">
          Boards QA du point hebdo (ids)
          <input
            value={qaBoards}
            onChange={(e) => setQaBoards(e.target.value)}
            className="rounded-lg border border-surface-700 bg-surface-950 px-3 py-2 text-surface-100"
            placeholder="946"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-primary-500/40 bg-primary-500/15 text-primary-200 hover:bg-primary-500/25 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Sauvegarder les connexions
          </button>
        </div>
      </div>
    </section>
  );
}
