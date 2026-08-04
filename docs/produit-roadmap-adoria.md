# Page Produit & Roadmap Adoria 26 (Monday.com)

Documentation fonctionnelle et technique pour la section **Produit** (`ProduitDashboard.tsx`) et la logique **Roadmap Adoria 2026** connectée à Monday.com.

## FR — Vue d’ensemble

- **Données** : board Monday (par défaut ID `5191064770`), items et colonnes via l’API interne.
- **Filtres** :
  - **Trimestre (Q1–Q4)** : la **1ʳᵉ** et la **2ᵉ** date de la colonne **`DATE`** (titre exact, insensible à la casse) doivent être entièrement dans le **même trimestre calendaire** et l’**année civile en cours**. Les plages sur années passées ou chevauchant deux trimestres sont exclues.
  - **Statut** : cases à cocher multiples ; aucune case cochée = pas de filtre.
  - **Team** : cases à cocher multiples (libellés Monday connus + valeurs du board) ; aucune case cochée = pas de filtre (tout afficher).
  - **Filtres par défaut** : bouton « Enregistrer comme filtres par défaut » (trimestre + statut + team) ; stockés sur le document User (`preferences.roadmapAdoria2026Filters`) via `GET/PUT /api/auth/me/preferences/roadmap-adoria-2026-filters`, réappliqués au chargement de la page pour l’utilisateur connecté.
  - **Validation** : `parseRoadmapAdoria2026Filters` (trimestre `all|Q1–Q4`, `statut` et `team` tableaux de chaînes normalisés : trim, unicité, tri `fr`).
  - **Tests** : TI `authRoutes.preferences.test.ts` ; TU `parseRoadmapAdoria2026Filters.test.ts` + `User.preferences.test.ts` ; frontend `authApi.test.ts` + `ProduitDashboard.test.tsx` (chargement / CTA enregistrement).
- **Indicateurs (encart ratio CP)** : RAF trimestre si le filtre trimestre correspond au trimestre courant et année courante ; projets non terminés avec date de fin dans ce trimestre.
- **Encarts « Sans … » (13 contrôles)** : un encart compact par contrôle qualité, sur le **même périmètre filtré** que les graphiques Roadmap (trimestre / statut / team), plus éventuellement l’encart **RAF**. Un **clic** ouvre une **modale** listant les lignes concernées (nom, valeur de colonne, statut si disponible). Définitions dans `ROADMAP_MISSING_INDICATORS` (`roadmapAdoriaKpi.ts`), rendu par le composant local `RoadmapMissingIndicatorTile`.

| Encart | Colonne Monday testée | Règle « manquant » | Colonne « … requis ? » |
|--------|----------------------|--------------------|------------------------|
| Sans CP référent | `CP référent` | vide, « - » ou « sans nom » | — |
| Sans solution doc | `Solution doc` | vide ou « - » | — |
| Sans wireframe | `Wireframe` | vide ou « - » | `Wireframe requis ?` = OUI / À définir |
| Sans maquettes | `Lien vers la maquette` | vide ou « - » | `Maquettes requis ?` = OUI / À définir |
| Sans macro chiffrage | `Macro chiffrage` | vide, « - », non numérique ou ≤ 0 | — |
| Sans estimation | `Estimation` | vide, « - », non numérique ou ≤ 0 | — |
| Sans devis | `Devis` (fichier) | aucun fichier | — |
| Sans validation client | `Validation client` | case non cochée | — |
| Sans validation clients | `Validation clients` | case non cochée | — |
| Sans validation opérationnelle | `Validation opérationnelle` | case non cochée | — |
| Sans validation marketing | `Validation marketing` | case non cochée | `Marketing requis ?` = OUI / À définir |
| Sans clients pilotes | `Clients pilotes` | aucune valeur | — |
| Sans Epic | `Lien Epic` | vide ou « - » | — |

- **Source de la liste** : les vues enregistrées « Sans … » du board Monday `5191064770`. Les encarts reprennent la **colonne testée** et la **colonne « … requis ? »** de chaque vue, mais **pas** ses restrictions propres (groupe `Q3 2026`, exclusions `Status` To do / Stuck, exclusions `Team`, `Source` = Dev request, préfixe de nom `FAC`) : le périmètre est celui des **filtres de la page**. Les compteurs peuvent donc différer de ceux affichés dans Monday.
- **Détection des colonnes** : égalité de titre **exacte** d’abord (insensible à la casse / aux accents), puis inclusion, chaque colonne n’étant attribuée qu’à un seul encart. C’est ce qui évite les confusions `Wireframe` / `Wireframe requis ?`, `Devis` / `Jours devis` et `Validation client` / `Validation clients`.
- **Colonne absente du board** : l’encart s’affiche en gris avec « — » et un compteur à 0 (`hasColumn: false`).
- **Règle « macro / estimation manquant »** : identique dans les encarts et le diagramme « macro vs estimation » (vide, « - », non numérique ou **≤ 0** ; le diagramme n’affiche pas les paires entièrement nulles). Colonnes également détectées par mots-clés en secours (`ROADMAP_MACRO_CHIFFRAGE_KEYS` / `ROADMAP_ESTIMATION_KEYS`).
- **Vue 4 colonnes** : Done / To do / En cours / En retard (2ᵉ date avant aujourd’hui, hors statuts « done »).
- **Graphiques** : répartition par **CP référent**, **PM** (sans nom → « Non attribués »), **statut** — grille responsive (1 / 2 / 3 colonnes).

## EN — Overview

- **Data** : Monday board (default ID `5191064770`).
- **Quarter filter** : both bounds of the **`DATE`** column must fall in the **same calendar quarter** and the **current year**; straddling quarters or past years are excluded.
- **Status filter** : multi-select checkboxes; empty selection means no status filter.
- **Team filter** : multi-select checkboxes (known Monday labels ∪ board values); empty selection means no team filter.
- **Charts** : CP referent, **PM** (empty → « Non attribués »), status — responsive grid.
- **13 “missing” tiles** (same filtered scope as roadmap charts): CP referent, solution doc, wireframe, mockups, macro estimate, estimation, quote, client / clients / ops / marketing validations, pilot clients, Epic link — plus the optional **RAF** quarter tile. Column titles and “required?” gates come from the Monday saved views « Sans … »; the views’ own restrictions (group, status/team exclusions, source, name prefix) are **not** replicated, the page filters define the scope. **Click** opens a **modal** with the matching rows (name, column value, status when available).
- **Macro / estimation “missing” rule** : columns are resolved by **title** keywords (`ROADMAP_MACRO_CHIFFRAGE_KEYS`, `ROADMAP_ESTIMATION_KEYS`). A row is missing if the cell is empty, « - », non-numeric, or **≤ 0** — consistent with the macro vs estimation chart (pairs with both values at zero are skipped there).

## Module testable (`frontend/src/domain/roadmapAdoriaKpi.ts`)

La logique métier (dates, trimestres, statuts, agrégations KPI, classification kanban) est **extraite** du composant pour :

- faciliter les **tests unitaires** ;
- éviter de dupliquer les règles.

### API exportée (principale)

| Export | Rôle |
|--------|------|
| `parseRoadmapDateColumnRange` | 1ʳᵉ / 2ᵉ date ISO ; une seule date → début = fin |
| `roadmapRangeFullyInQuarter` | Vérifie même année + même trimestre pour les deux bornes |
| `roadmapRangeFullyInQuarterCurrentYear` | Idem + année = année filtrée (courante côté UI) |
| `parseRoadmapDateColumnEndDate` | Date de fin (2ᵉ ISO) |
| `calendarQuarterFromDate` | Q1–Q4 calendaires |
| `getQuarterEndDate` / `calendarDaysInclusiveFromTodayToQuarterEnd` | RAF / jours restants |
| `isRoadmapStatusDone` / `isRoadmapStatusTodo` | Mots-clés normalisés (accents retirés) |
| `classifyRoadmapKanbanBucket` | `retard` \| `done` \| `todo` \| `encours` |
| `computeRoadmapKpis` | `byCpReferent`, `byPm`, `byStatus`, ratio CP, `missingMacroChiffrage` / `missingEstimation`, `hasMacroChiffrageColumn` / `hasEstimationColumn` |
| `EMPTY_ROADMAP_KPIS` | Valeurs par défaut (y compris compteurs macro / estimation à 0) quand le filtre ne retient aucune ligne |
| `ROADMAP_MISSING_INDICATORS` | Les 13 définitions d’encarts « Sans … » (libellé, titres de colonne, règle, colonne « … requis ? ») |
| `computeRoadmapMissingIndicators` | Compteurs + lignes manquantes des 13 encarts sur les lignes filtrées |
| `resolveRoadmapMissingIndicatorColumns` | Colonne testée + colonne « … requis ? » par encart, sans collision entre encarts |
| `findRoadmapColumnByTitles` / `normalizeRoadmapColumnTitle` | Détection de colonne par titre exact puis inclusion (sans accents / casse) |
| `isRoadmapIndicatorValueMissing` / `isRoadmapCheckboxUnchecked` / `isRoadmapIndicatorRowApplicable` | Règles unitaires : cellule manquante, case non cochée, ligne dans le périmètre |
| `ROADMAP_MACRO_CHIFFRAGE_KEYS` / `ROADMAP_ESTIMATION_KEYS` | Mots-clés titres colonnes pour macro chiffrage et estimation |
| `findColumnPreferSpecific` | Détection colonne par mots-clés, **plus long d’abord** (réduit les faux positifs) |
| `getMondayItemNumericValue` | Lecture valeur numérique Monday (texte, JSON `numbers`, `value` numérique runtime) |
| `resolveRoadmapMacroEstimationColumns` | Paire `{ macro, est }` ; la colonne macro est exclue avant de résoudre l’estimation |
| `isRoadmapNumericKpiValueMissing` | « Manquant » pour encarts macro / estimation (vide, `-`, ≤ 0) ; `col === null` → non manquant côté comptage |
| `findRoadmapDateColumn` / `findRoadmapPmColumn` | Détection colonnes `DATE` / `PM` |
| `STATUS_KEYS` | Mots-clés pour colonne statut |

### Colonnes Monday attendues

- **DATE** : titre exact `date` (ex. `DATE`). Plage type `YYYY-MM-DD - YYYY-MM-DD`.
- **PM** : titre exact `pm` ou colonne « product manager » / « chef de produit ».
- **CP référent**, **Statut** : détection par mots-clés (voir constantes dans le module).
- **Macro chiffrage**, **Estimation** : titre de colonne contenant l’un des libellés des tableaux `ROADMAP_MACRO_CHIFFRAGE_KEYS` et `ROADMAP_ESTIMATION_KEYS` (ex. « Macro chiffrage », « Estimation », « chiffrage initial », « jours estimés »…). Utilisés pour les encarts KPI, le diagramme comparatif et les modales de détail.
- **Colonnes des encarts « Sans … »** : voir le tableau de la section « Vue d’ensemble » (`Solution doc`, `Wireframe`, `Lien vers la maquette`, `Devis`, `Validation client(s)`, `Validation opérationnelle`, `Validation marketing`, `Clients pilotes`, `Lien Epic`) ainsi que les colonnes de conditionnement `Wireframe requis ?`, `Maquettes requis ?`, `Marketing requis ?`.

## Tests unitaires

```bash
cd frontend
yarn test src/domain/roadmapAdoriaKpi.test.ts
```

Couverture ciblée : parsing des dates, règles trimestre / année, statuts done/todo, classification kanban, agrégation `computeRoadmapKpis` (dont macro / estimation et absence de ces colonnes), `findColumnPreferSpecific`, `getMondayItemNumericValue`, `resolveRoadmapMacroEstimationColumns`, `isRoadmapNumericKpiValueMissing`, `EMPTY_ROADMAP_KPIS`, comptage de jours jusqu’à fin de trimestre (scénario hors DST pour stabilité CI), et les **13 encarts « Sans … »** (résolution des colonnes par titre exact, colonnes « … requis ? », cases à cocher, règles numériques, colonne absente, tri des lignes).

Côté composant, `ProduitDashboard.test.tsx` vérifie l’affichage des 13 encarts, le « — » quand la colonne est absente, et l’ouverture de la modale de détail (dont l’exclusion des lignes « … requis ? » = NON).

Le composant `ProduitDashboard.tsx` reste une couche **UI + hooks** ; les régressions métier sont prioritairement couvertes via `roadmapAdoriaKpi.test.ts`.

## Fichiers concernés

- `frontend/src/components/ProduitDashboard.tsx` — page et intégration Monday
- `frontend/src/domain/roadmapAdoriaKpi.ts` — règles métier Roadmap Adoria
- `frontend/src/domain/roadmapAdoriaKpi.test.ts` — tests Vitest
- `frontend/src/services/authApi.ts` — `get/saveRoadmapAdoria2026DefaultFilters`
- `frontend/src/services/authApi.test.ts` — TU client préférences filtres
- `frontend/src/components/ProduitDashboard.test.tsx` — application / enregistrement des filtres par défaut
- `backend/src/domain/user/entities/User.ts` — `preferences.roadmapAdoria2026Filters`
- `backend/src/domain/user/parseRoadmapAdoria2026Filters.ts` — validation / normalisation
- `backend/src/domain/user/parseRoadmapAdoria2026Filters.test.ts` — TU validation
- `backend/src/domain/user/entities/User.preferences.test.ts` — TU schéma / constantes
- `backend/src/routes/authRoutes.ts` — `GET/PUT /me/preferences/roadmap-adoria-2026-filters`
- `backend/src/routes/authRoutes.preferences.test.ts` — tests TI des préférences
