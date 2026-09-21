/**
 * Types du domaine "Équipes" côté frontend — miroir de
 * `backend/src/domain/team/entities/Team.ts`. Le rattachement d'un
 * collaborateur à une équipe (`User.teamId`) et le droit délégué
 * (`User.canManageTeamAssignment`) vivent sur le type `User` (voir
 * `store/useStore.ts` et `services/authApi.ts`), pas ici.
 */

export interface Team {
  id: string;
  name: string;
  leadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamInput {
  name: string;
  leadIds?: string[];
}

export interface UpdateTeamInput {
  name?: string;
  leadIds?: string[];
}

/** Un collaborateur actif de l'organisation (résultat de `GET /teams/roster`), avec ou sans équipe. */
export interface RosterUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  teamId: string | null;
}
