import { useEffect, useState } from 'react';
import { epicApi, type EpicTimeByUserResponse } from '../services/api';

/**
 * Temps passé (et coûts, si le serveur les renvoie) par personne et par rôle sur une épic (issue #44).
 * Partagé par la modale épic : bloc « Temps passé par personne » et tuile « Coût du projet ».
 */
export function useEpicTimeByUser(epicKey: string): { data: EpicTimeByUserResponse | null; error: string | null } {
  const [data, setData] = useState<EpicTimeByUserResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    epicApi
      .getTimeByUser(epicKey)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger le temps passé par personne.');
      });
    return () => {
      cancelled = true;
    };
  }, [epicKey]);

  return { data, error };
}
