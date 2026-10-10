# Coûts et taux horaires

## 1. Objectif

Renseigner les taux horaires des collaborateurs pour valoriser le temps passé (coût d'une épic notamment). Public : super admins et rôles ayant la page `couts`.

## 2. Parcours utilisateur

| Action | Qui |
|---|---|
| Voir la liste des collaborateurs et leurs taux | Super admin, rôle `couts` |
| Modifier les taux d'un collaborateur | Super admin, rôle `couts` |
| Ajouter un compte non SSO à la liste (candidats) | Super admin |
| Retirer un compte non SSO | Super admin |

La liste réunit les utilisateurs SSO Microsoft et les comptes non SSO explicitement ajoutés.

## 3. Règles métier

- 0 à 3 taux par personne. Le premier n'a pas de date (coût initial) ; les suivants ont une date de début AAAA-MM-JJ, strictement croissantes.
- Taux compris entre 0 et 100 000 euros.
- Taux en vigueur un jour donné = dernier taux commencé à cette date.
- Coût d'un jour = (secondes / 3600) x taux en vigueur ce jour.
- Retirer un compte efface ses taux. Un compte SSO ne peut pas être retiré.
- Un taux n'est utilisé que pour un utilisateur présent dans la liste des coûts.

## 4. Données

| Entité | Champs |
|---|---|
| Taux horaire | montant, date de début (vide pour le premier), chiffré en base |
| Indicateur « inclus dans les coûts » | pour les comptes non SSO |

Usage : [Épics](SUIVI_EPICS.md), section « Temps par personne ».

## 5. Limites connues

- Pas de devise (euros supposés), pas de coût journalier moyen ni de coût chargé.
- Maximum 3 taux : l'historique plus long n'est pas géré.
- Personne sans taux : coût compté à 0 et signalé par « personnes sans coût » dans l'épic.

## 6. Références code

- `backend/src/routes/costRoutes.ts` : routes `/api/costs`.
- `backend/src/domain/user/hourlyRates.ts`, `costList.ts`, `backend/src/application/services/appUserDirectory.ts`.
- `frontend/src/components/CostsPage.tsx`.
