# Page Produit & Roadmap Adoria 26 (Monday.com)

Documentation fonctionnelle et technique pour la section **Produit** (`ProduitDashboard.tsx`) et la logique **Roadmap Adoria 2026** connectée à Monday.com.

## FR — Vue d’ensemble

- **Données** : board Monday (par défaut ID `5191064770`), items et colonnes via l’API interne.
- **Filtres** :
  - **Trimestre (Q1–Q4)** : la **1ʳᵉ** et la **2ᵉ** date de la colonne **`DATE`** (titre exact, insensible à la casse) doivent être entièrement dans le **même trimestre calendaire** et l’**année civile en cours**. Les plages sur années passées ou chevauchant deux trimestres sont exclues.
  - **Statut** : cases à cocher multiples ; aucune case cochée = pas de filtre.
- **Indicateurs (encart ratio CP)** : RAF trimestre si le filtre trimestre correspond au trimestre courant et année courante ; projets non terminés avec date de fin dans ce trimestre.
- **Encarts KPI compacts** (même périmètre filtré que les graphiques Roadmap) : **CP référent manquants**, **Solution doc manquant**, **Macro chiffrage manquant**, **Estimation manquante**, et éventuellement **RAF** (voir ci-dessus). Un **clic** sur un encart ouvre une **modale** listant les lignes concernées (nom, valeur de colonne, statut si disponible).
- **Règle « macro / estimation manquant »** : colonne détectée par mots-clés sur le **titre** Monday (voir `ROADMAP_MACRO_CHIFFRAGE_KEYS` / `ROADMAP_ESTIMATION_KEYS` dans `roadmapAdoriaKpi.ts`). Une ligne compte comme manquante si la cellule est vide, « - », non numérique ou **≤ 0** — aligné avec le diagramme « macro vs estimation » qui n’affiche pas les paires entièrement nulles.
- **Vue 4 colonnes** : Done / To do / En cours / En retard (2ᵉ date avant aujourd’hui, hors statuts « done »).
- **Graphiques** : répartition par **CP référent**, **PM** (sans nom → « Non attribués »), **statut** — grille responsive (1 / 2 / 3 colonnes).

## EN — Overview

- **Data** : Monday board (default ID `5191064770`).
- **Quarter filter** : both bounds of the **`DATE`** column must fall in the **same calendar quarter** and the **current year**; straddling quarters or past years are excluded.
- **Status filter** : multi-select checkboxes; empty selection means no status filter.
- **Charts** : CP referent, **PM** (empty → « Non attribués »), status — responsive grid.
- **Compact KPI tiles** (same filtered scope as roadmap charts): missing **CP referent**, missing **Solution doc**, missing **macro chiffrage**, missing **estimation**, optional **RAF** quarter tile. **Click** opens a **modal** with the matching rows (name, column value, status when available).
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

## Tests unitaires

```bash
cd frontend
yarn test src/domain/roadmapAdoriaKpi.test.ts
```

Couverture ciblée : parsing des dates, règles trimestre / année, statuts done/todo, classification kanban, agrégation `computeRoadmapKpis` (dont macro / estimation et absence de ces colonnes), `findColumnPreferSpecific`, `getMondayItemNumericValue`, `resolveRoadmapMacroEstimationColumns`, `isRoadmapNumericKpiValueMissing`, `EMPTY_ROADMAP_KPIS`, comptage de jours jusqu’à fin de trimestre (scénario hors DST pour stabilité CI).

Le composant `ProduitDashboard.tsx` reste une couche **UI + hooks** ; les régressions métier sont prioritairement couvertes via `roadmapAdoriaKpi.test.ts`.

## Fichiers concernés

- `frontend/src/components/ProduitDashboard.tsx` — page et intégration Monday
- `frontend/src/domain/roadmapAdoriaKpi.ts` — règles métier Roadmap Adoria
- `frontend/src/domain/roadmapAdoriaKpi.test.ts` — tests Vitest
