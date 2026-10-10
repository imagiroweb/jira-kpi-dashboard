# Équipes

## 1. Objectif

Définir les équipes, leurs responsables (leads) et le rattachement des collaborateurs. Les équipes déterminent qui voit quelles fiches de performance. Public : super admins, détenteurs de la portée globale performance, leads.

## 2. Parcours utilisateur

| Action | Qui |
|---|---|
| Lister les équipes | Tout utilisateur connecté |
| Créer / renommer une équipe, définir les leads, voir le roster complet | Accès global |
| Rattacher un collaborateur à une équipe | Accès global (tout) ; lead avec délégation (sa propre équipe) |
| Détacher un collaborateur | Accès global |
| Déléguer le droit de gérer les affectations à un lead | Accès global |

Accès global = super admin ou rôle avec `performanceGlobalAccess`.

## 3. Règles métier

- Nom d'équipe unique.
- Un lead sans équipe est rattaché automatiquement à l'équipe qu'il dirige.
- Lead avec délégation : peut seulement rattacher à sa propre équipe, ne peut ni détacher ni déplacer un lead. Sans délégation : refus (403).
- Un changement d'équipe met à jour la fiche des cycles ouverts (brouillon ou actif).

## 4. Données

| Entité | Champs |
|---|---|
| Équipe | nom (unique), leads |
| Utilisateur | équipe, droit de gérer les affectations |

## 5. Limites connues

- Un collaborateur appartient à une seule équipe.
- Les fiches de cycles clos gardent l'équipe d'origine (photographie à la création).

## 6. Références code

- `backend/src/routes/teamRoutes.ts` : routes équipes.
- `backend/src/domain/team/entities/Team.ts`, `backend/src/domain/team/teamAssignment.ts`.
- `backend/src/domain/performance/reviewTeam.ts`.
- `frontend/src/components/TeamsCyclesAdminPanel.tsx`, `frontend/src/domain/team.ts`.
