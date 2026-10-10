# Marketing (Brevo)

## 1. Objectif

Suivre les contacts, listes, campagnes email et emails transactionnels issus de Brevo. Public : rôle ayant la page `marketing` (Marketing par défaut).

## 2. Parcours utilisateur

| Action | Détail |
|---|---|
| Vue d'ensemble | Contacts, listes, 10 campagnes récentes, 50 campagnes manuelles avec statistiques. |
| Statut du compte | Informations du compte et état de la connexion. |
| Événements transactionnels | Filtrables par type d'événement, sur 1 à 90 jours (30 par défaut), 1 à 2500 lignes (200 par défaut). |
| Destinataires d'une campagne | Cliqueurs ou désinscrits, avec export. |

## 3. Règles métier

- Statistiques normalisées : envoyés, délivrés, ouverts, cliqués, désinscrits, hard bounces, soft bounces.
- Si tous les compteurs sont à zéro et que le compte est inaccessible, l'interface le signale (échec d'authentification Brevo).
- Clé API absente : service indisponible (503).
- L'export des destinataires est journalisé sans les adresses email.

## 4. Données

Contacts, listes, campagnes, événements transactionnels : lecture seule depuis Brevo. Variable `BREVO_API_KEY`.

## 5. Limites connues

- Lecture seule : aucune campagne n'est créée ni envoyée depuis l'application.
- Seules 10 campagnes récentes et 50 campagnes manuelles sont chargées.
- L'envoi des emails de l'application (invitation, reset) passe par SMTP et non par Brevo.

## 6. Références code

- `backend/src/routes/brevoRoutes.ts`.
- `backend/src/infrastructure/brevo/BrevoClient.ts`.
- `frontend/src/components/MarketingDashboard.tsx`.
