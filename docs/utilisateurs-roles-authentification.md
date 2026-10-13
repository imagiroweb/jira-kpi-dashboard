# Utilisateurs, rôles et authentification

## 1. Objectif

Contrôler qui accède à l'application et à quelles pages : connexion (locale ou Microsoft), mot de passe oublié, rôles et visibilité des pages, administration des comptes, traçabilité (logs d'activité) et conformité RGPD (export, anonymisation, rétention). Public : tous les utilisateurs (connexion) et les super admins (administration).

## 2. Parcours utilisateur

| Écran / action | Qui | Ce qui se passe |
|---|---|---|
| Connexion locale (email + mot de passe) | Compte local | Session de 24 h par défaut. Messages : « Email ou mot de passe incorrect », « Ce compte a été désactivé ». |
| Connexion Microsoft (SSO) | Compte de l'entreprise | Redirection Microsoft puis retour dans l'application. Premier passage : compte créé avec le rôle « Utilisateur » et `firstLogin` vrai. |
| Mot de passe oublié | Compte local | Email avec lien valable 1 h. La réponse est toujours identique, que l'email existe ou non. |
| Définir son mot de passe (invitation) | Invité | Lien valable 72 h reçu par email. |
| Menu latéral | Tous | N'affiche que les pages visibles pour le rôle. Groupe « Suivi performance » (performance, performanceDashboard), groupe « Paramètres » (gestionUtilisateurs, couts). Un groupe avec une seule page visible s'affiche comme une page simple. |
| Bouton « Mes données » | Tous | Export RGPD de ses propres données. |
| Gestion des utilisateurs | Super admin | Inviter un compte local, changer le rôle, activer/désactiver, anonymiser, consulter logs et statistiques de pages. |
| Gestion des rôles | Super admin | Créer / renommer un rôle et cocher les pages visibles. Pas de suppression. |
| Paramètres de rétention | Super admin | Voir [Intégrations et paramètres](integrations-parametres.md). |

## 3. Règles métier

### Pages et rôles

Pages pilotables : dashboard, users, support, epics, marketing, produit, pointHebdo, gestionUtilisateurs, performance, performanceDashboard, couts.

- `dashboard` et `performance` sont toujours visibles pour les rôles semés.
- Nouveau rôle : tout à vrai sauf `gestionUtilisateurs`, `performanceDashboard` et `couts`.
- Un rôle porte aussi un indicateur `performanceGlobalAccess` (portée « CTO » sur la performance, faux par défaut).
- Utilisateur sans rôle : `dashboard` et `performance` seulement.
- Super admin (`role = super_admin`) : toutes les pages et accès global performance. Jamais attribué automatiquement ; créé par le script `admin:bootstrap` ou par un autre super admin.

Rôles créés au démarrage (en plus de `dashboard` et `performance`) :

| Rôle | Pages supplémentaires |
|---|---|
| Utilisateur | aucune |
| Dev | support, pointHebdo |
| PO | users, epics, pointHebdo |
| Product | produit, pointHebdo |
| Marketing | marketing |

Aucun rôle semé n'a `gestionUtilisateurs`, `performanceDashboard` ni `couts`. Les visibilités de ces rôles sont réécrites à chaque démarrage du serveur.

### Contrôle d'accès

- Chaque requête API revérifie en base le compte (actif) et la version de session ; les droits de page sont relus à chaque appel.
- Le contrôle de page se fait côté API et par le menu ; l'interface n'ajoute pas de garde propre.
- Sessions révoquées (reconnexion obligatoire) lors d'un changement de rôle, d'une désactivation, d'un reset de mot de passe ou d'une anonymisation.

### Mot de passe (comptes locaux)

- Minimum 12 caractères avec majuscule, minuscule, chiffre et caractère spécial parmi `!@#$%^&*()_+-=[]{}|;:,.<>?`.
- Score indicatif (plafonné à 100) : longueur >= 12 : +20, >= 16 : +10 de plus, >= 20 : +10 de plus ; majuscule +15 (+5 si >= 2) ; minuscule +15 ; chiffre +15 (+5 si >= 2) ; spécial +20 (+10 si >= 2).
- Niveaux : < 40 faible, < 60 moyen, < 80 fort, sinon très fort.

### Inscription et invitation

- Pas d'inscription libre. Un super admin invite : compte local créé dans son organisation, domaine d'email contrôlé, rôle optionnel (sinon « Utilisateur »), lien de définition valable 72 h par email.
- La connexion locale n'est possible que si l'organisation est active et autorise les comptes locaux.

### Reset du mot de passe

- Lien à usage unique valable 1 h. Si l'email ne part pas, le lien est annulé et une erreur est renvoyée.
- Le nouveau mot de passe respecte la politique ci-dessus ; les sessions existantes sont révoquées.

### SSO Microsoft

- Le tenant Microsoft du jeton doit correspondre à une organisation active (liste blanche) et le domaine d'email doit être autorisé.
- Refus : jeton invalide (401), tenant ou domaine refusé (403), vérification indisponible (503). Un compte appartenant à une autre organisation est refusé.
- L'utilisateur est reconnu par son identifiant Microsoft, sinon par email.

### Limitation de débit

| Action | Limite |
|---|---|
| Connexion | 5 échecs / 15 min par IP + email ; 20 échecs / 15 min par IP (les succès ne comptent pas) |
| Mot de passe oublié | 5 / 15 min |
| Reset | 10 / 15 min |
| SSO | 20 / 5 min |
| Vérification de mot de passe | 30 / min |
| Invitations | 20 / heure par admin |
| API globale | 200 requêtes / min par IP |

### Administration (super admin uniquement)

- Activer / désactiver : pas sur soi-même, même organisation.
- Anonymisation : irréversible, saisie de l'email de confirmation obligatoire, pas sur soi-même, impossible si déjà anonymisé.
- Les comptes anonymisés sont masqués de la liste.
- Rôle : nom unique, la liste des pages doit être complète.

### Logs d'activité

| Type | Règle |
|---|---|
| login | un seul par minute |
| page_view | une même page une fois par minute |
| password_reset_request / password_reset_complete | à chaque demande / réinitialisation |

- Un super admin consulte les logs d'un utilisateur (1 à 500, défaut 100) et les statistiques de pages sur 1 à 365 jours (défaut 30) : compteur par page, total, pourcentage arrondi à 0,1 %, compteur quotidien.

### RGPD

| Fonction | Règle |
|---|---|
| Export | Chacun exporte ses données ; un super admin exporte celles d'un utilisateur de son organisation. |
| Anonymisation | Email remplacé par `supprime-<id>@anonyme.invalid`, compte désactivé, taux horaires et préférences effacés, retrait des responsabilités d'équipe, logs d'activité supprimés. Fiches de performance conservées pour les statistiques mais anonymisées (textes libres effacés, lien rompu). Nom d'auteur remplacé par « Utilisateur supprimé » dans les snapshots, points hebdo et fiches. Les champs libres saisis par d'autres ne sont pas modifiés. |
| Rétention | Purge quotidienne selon les durées de l'organisation (voir [Intégrations et paramètres](integrations-parametres.md)). |

## 4. Données

| Entité | Champs importants |
|---|---|
| Utilisateur | email (chiffré en base, empreinte pour la recherche), fournisseur (local / microsoft), rôle, super admin, actif, organisation, équipe, `firstLogin`, version de session |
| Rôle | nom, visibilité par page, `performanceGlobalAccess` |
| Organisation | tenants Microsoft autorisés, domaines d'email, comptes locaux autorisés, durées de rétention |
| Journal d'activité | utilisateur, type, page, date |
| Préférence | filtres par défaut de la Roadmap Adoria (voir [Produit et roadmap](produit-roadmap-adoria.md)) |

Sources externes : Microsoft Entra ID (SSO), SMTP (emails d'invitation et de reset).

## 5. Limites connues

- Aucune route pour supprimer un rôle ni pour modifier `performanceGlobalAccess` d'un rôle (le seed ne l'écrit pas non plus) : l'attribution de la portée globale performance ne se fait pas depuis l'interface.
- Le démarrage réécrit les visibilités des cinq rôles semés : une modification manuelle de ces rôles est perdue au redémarrage.
- Pas de garde de page côté interface : seules les API sont protégées. Les routes Monday (produit) et point hebdo ne vérifient que la connexion, pas la page. Le bouton « Synchroniser » est accessible à tout utilisateur connecté.
- Le type de log `error_500` existe mais aucune écriture n'a été repérée.
- Limitation de débit en mémoire : valable par instance du serveur.
- Un commentaire de la configuration de rétention parle de fiches « supprimées » alors que le code les anonymise.

## 6. Références code

- `backend/src/routes/authRoutes.ts` : connexion, SSO, reset, invitations, administration, export, logs.
- `backend/src/application/services/AuthService.ts` : session, mot de passe, SSO.
- `backend/src/domain/user/entities/Role.ts` : pages et défauts des rôles.
- `backend/src/domain/user/` : règles de mot de passe (politique et score).
- `backend/src/index.ts` : semis des rôles au démarrage.
- `backend/src/middleware/authMiddleware.ts` : `authenticate`, `requirePage`.
- `backend/src/middleware/rateLimits.ts` : limites de débit.
- `backend/src/application/services/personalDataService.ts` : export et anonymisation.
- `backend/src/routes/organizationRoutes.ts` : organisation et rétention.
- `frontend/src/components/Sidebar.tsx`, `frontend/src/domain/sidebarNav.ts` : menu.
- `frontend/src/components/UserManagementPage.tsx`, `LoginPage.tsx`, `InviteLocalUserForm.tsx` : écrans.
