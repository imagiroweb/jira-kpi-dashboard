import axios from 'axios';
import type { RosterCandidate } from '../../domain/performance/importCollaboratorMapping';
import type { ObjectiveDefinitionInput } from '../../domain/performance/performanceReview';

export interface ApiCycle {
  id: string;
  label: string;
  status: 'draft' | 'active' | 'closed';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement ${name} manquante`);
  }
  return value;
}

/**
 * Client HTTP minimal pour les scripts d'import ponctuel, authentifié via un token JWT fourni en
 * variable d'environnement (`IMPORT_API_TOKEN`) — décision produit : pas de login programmatique,
 * l'opérateur du script colle le token d'une session existante (CTO/super_admin).
 */
export function createImportApiClient() {
  const baseURL = process.env.IMPORT_API_BASE_URL || 'http://localhost:3002/api';
  const token = requireEnv('IMPORT_API_TOKEN');

  const client = axios.create({
    baseURL,
    headers: { Authorization: `Bearer ${token}` }
  });

  return {
    /** GET /teams/roster — liste des collaborateurs actifs, pour la correspondance nom → utilisateur. */
    async fetchRoster(): Promise<RosterCandidate[]> {
      const { data } = await client.get('/teams/roster');
      if (!data?.success) {
        throw new Error("Échec de la récupération du roster (GET /teams/roster)");
      }
      return data.users;
    },

    /** GET /performance/cycles — pour résoudre le cycle cible par libellé avant d'écrire. */
    async fetchCycles(): Promise<ApiCycle[]> {
      const { data } = await client.get('/performance/cycles');
      if (!data?.success) {
        throw new Error('Échec de la récupération des cycles (GET /performance/cycles)');
      }
      return data.cycles;
    },

    /**
     * PATCH /performance/reviews/:userId/objectives — (re)définit les objectifs d'un collaborateur
     * pour le cycle donné. Réutilise la route déjà validée par l'application plutôt que d'écrire
     * directement en base, pour bénéficier de la même logique de fusion/validation que l'UI.
     */
    async writeObjectives(userId: string, objectives: ObjectiveDefinitionInput[], cycleId: string): Promise<void> {
      const { data } = await client.patch(`/performance/reviews/${userId}/objectives`, { objectives, cycleId });
      if (!data?.success) {
        throw new Error("Échec de l'écriture des objectifs");
      }
    }
  };
}
