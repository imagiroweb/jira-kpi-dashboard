# Plan de tests : filtre « FAC » sur les encarts devis et validation client (page Produit, Roadmap Adoria)
Spec : https://github.com/imagiroweb/jira-kpi-dashboard/issues/66

Périmètre : les encarts `devis` (« Sans devis »), `validationClient` (« Sans Validation client devis ») et `validationClients` (« Sans validation client finale ») de `ROADMAP_MISSING_INDICATORS` (`frontend/src/domain/roadmapAdoriaKpi.ts`) ne comptent que les éléments Monday dont le **nom** commence par « FAC » (préfixe, casse ignorée, espaces en tête ignorés, aucun séparateur exigé). La règle s'ajoute aux filtres de page (trimestre, statut, team) et aux gates « … requis ? ». Les 10 autres encarts ne changent pas. Hors périmètre : groupe, exclusion To do / Stuck, Team, Source = Dev request, écriture Monday.

Recette sur fixtures uniquement : aucun chiffre Monday de référence (ni 14 / 13 en Q4) ne sert d'attendu. Tous les tests tournent en local / CI, sans appel Monday réel.

## Cas d'usage
Un seul rôle est concerné : tout utilisateur ayant le droit `produit` (responsable produit). La règle FAC ne dépend pas du rôle.

| ID | Acteur (rôle) | Scénario | Résultat attendu |
|---|---|---|---|
| UC1 | Responsable produit (droit `produit`) | Consulte l'encart « Sans devis » alors que le board contient des éléments FAC et non FAC sans devis | Seuls les éléments FAC sont comptés |
| UC2 | Responsable produit | Consulte « Sans Validation client devis » et « Sans validation client finale » avec des éléments FAC / non FAC aux cases non cochées | Seuls les éléments FAC sont comptés dans chacun des deux encarts |
| UC3 | Responsable produit | Change le trimestre, le statut ou la team | Le compteur se recalcule avec la règle FAC en plus du filtre |
| UC4 | Responsable produit | Clique sur l'un des trois encarts | La fenêtre de détail liste exactement les éléments comptés (lignes = compteur) |
| UC5 | Responsable produit | Lit le texte d'aide des trois encarts | Le texte indique que seuls les éléments FAC sont pris en compte |
| UC6 | Responsable produit | Consulte les 10 autres encarts « Sans … » | Comportement inchangé : les éléments non FAC y sont toujours comptés |

## Cas de test
Niveaux : U = unitaire domaine (`frontend/src/domain/roadmapAdoriaKpi.test.ts`, bloc existant des indicateurs « Sans … », avec `boardColumns` qui contient déjà `devis`, `valClient`, `valClients`, `joursDevis`) ; C = test de composant (`frontend/src/components/ProduitDashboard.test.tsx`, Vitest + Testing Library, API Monday mockée) ; E2E = Playwright. Aucune route backend n'est touchée : pas de test de route.

### Règle de nom (unitaire)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| T01 | UC1 (CA1) | Unitaire | Éléments « FAC-123 Export » et « Refonte menu », Devis vide sur les deux | `computeRoadmapMissingIndicators(items, boardColumns)` | `devis.missingCount` = 1, `missingItems` = [FAC-123 Export] | P1 |
| T02 | UC1 (CA2) | Unitaire | « fac-45 Import », Devis vide | idem | Compté (casse ignorée). Variantes à tester : `Fac`, `fAC` | P1 |
| T03 | UC1 (CA3) | Unitaire | « ␣␣FAC Relance » (deux espaces en tête), Devis vide | idem | Compté. Variante : tabulation en tête | P1 |
| T04 | UC1 (CA4) | Unitaire | « Sujet FAC », Devis vide | idem | Non compté (FAC pas en préfixe) | P1 |
| T05 | UC1 (CA1) | Unitaire | « FACTURATION export », « FAC123 », « FAC-1 », Devis vide | idem | Les trois sont comptés (aucun séparateur exigé) | P1 |
| T06 | UC1 | Unitaire | Noms « FA », « F », « FAÇ », « FÀC », « FAK Import » | idem | Aucun n'est compté (seule la séquence F-A-C ASCII compte). « FA » ne doit pas être accepté | P1 |
| T07 | UC1 | Unitaire | Nom « FAC » seul | idem | Compté (le préfixe suffit) | P2 |
| T08 | UC1 | Unitaire | Nom `''`, `'   '` (espaces seuls), `undefined`/`null` (cast, `MondayItem.name` peut être absent) | idem | Non compté, aucune exception levée | P1 |
| T09 | UC1 | Unitaire | Nom « Le FAC-12 », « [FAC] Export », « 1 FAC » | idem | Non comptés (préfixe strict, pas de recherche en milieu de chaîne) | P2 |
| T10 | UC1 | Unitaire | Nom avec espace insécable en tête («  FAC Relance ») | idem | Comportement à figer et documenter : `trim()` JS retire l'espace insécable, donc compté. Si le dev choisit autrement, le noter dans la PR | P3 |
| T11 | UC1 | Unitaire | Éléments dans le désordre : « FAC-Z », « fac-A », « FAC-M » | idem | `missingItems` triés par nom (tri `fr` existant) et limités aux FAC | P3 |

### Application aux trois encarts et aux règles existantes (unitaire)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| T12 | UC2 (CA5) | Unitaire | Un élément FAC et un non FAC, `Validation client` non cochée sur les deux | calcul | `validationClient.missingCount` = 1 (FAC uniquement) | P1 |
| T13 | UC2 (CA6) | Unitaire | Un élément FAC et un non FAC, `Validation clients` non cochée sur les deux | calcul | `validationClients.missingCount` = 1 (FAC uniquement) | P1 |
| T14 | UC1, UC2 (CA7) | Unitaire | Élément FAC avec fichier dans `Devis` et les deux cases cochées (`{"checked":true}`) | calcul | Absent des trois encarts (compteurs 0) | P1 |
| T15 | UC1, UC2 | Unitaire | Élément FAC avec Devis vide mais cases cochées ; élément FAC avec Devis renseigné mais cases décochées | calcul | Le premier n'apparaît que dans `devis`, le second que dans `validationClient` et `validationClients` : chaque encart garde sa propre colonne testée | P1 |
| T16 | UC6 (CA8) | Unitaire | Éléments non FAC : sans CP, sans solution doc, sans wireframe (requis = OUI), sans macro, sans estimation, sans maquette (requis = OUI), sans validation opérationnelle, sans validation marketing (requis = OUI), sans client pilote, sans Epic | calcul des 13 encarts | Les 10 autres encarts les comptent comme avant (comparer à l'état de référence : compter identique avec et sans élément « FAC » dans le nom). Les 3 encarts FAC les ignorent | P1 |
| T17 | UC6 | Unitaire | Mêmes éléments, deux jeux : noms FAC puis noms non FAC | calcul | `missingCount` et `applicableCount` des 10 autres encarts identiques entre les deux jeux | P1 |
| T18 | UC1 | Unitaire | Colonne `Devis` absente du board (cas déjà couvert) avec éléments FAC | calcul | `hasColumn` false, `missingCount` 0 : la règle FAC ne change pas ce cas (test existant à conserver) | P2 |
| T19 | UC1 | Unitaire | Aucun élément FAC dans la liste, colonne présente | calcul | `missingCount` 0, `missingItems` vide ; `applicableCount` suit la décision du dev (voir « Points à trancher ») | P2 |
| T20 | UC1 | Unitaire | Colonne `Jours devis` présente en plus de `Devis` | `resolveRoadmapMissingIndicatorColumns` | Résolution de colonne inchangée (`devis` → `Devis`) : non-régression | P3 |
| T21 | UC1 | Unitaire | Définitions des indicateurs | inspection de `ROADMAP_MISSING_INDICATORS` | Il y a 13 entrées ; seuls `devis`, `validationClient`, `validationClients` portent la restriction de nom ; les 10 autres ne la portent pas (règle définie par encart, pas globale). Adapter au nom de champ choisi par le dev | P2 |
| T22 | UC1 | Unitaire | Fonction utilitaire de test de préfixe (nom à fixer par le dev, ex. `isRoadmapItemNameWithPrefix`) exportée | appels directs | Table de vérité de T02 à T09 testée en isolation (`it.each`) | P2 |
| T23 | UC1 | Unitaire | Liste de 5 000 éléments, 1 sur 10 en FAC | calcul | Compteur correct, temps de calcul raisonnable (< 200 ms), pas de régression de complexité | P3 |

### Composant ProduitDashboard (filtres, liste au clic, aide)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| T24 | UC1 (CA1) | Composant | Board mocké avec colonnes `Devis`, `Validation client`, `Validation clients` et éléments FAC / non FAC en Q4 sans devis ; filtre Q4 | Rendre la page, lire la tuile « Sans devis » | Compteur 1 (FAC uniquement) | P1 |
| T25 | UC4 (CA10, CA1) | Composant | Idem T24 | Clic sur « Sans devis », ouvrir la modale | La modale « Sans devis — détail des lignes » contient « FAC-123 Export » et ne contient pas « Refonte menu » ; nombre de lignes du tableau = compteur de la tuile | P1 |
| T26 | UC4 (CA10) | Composant | Idem, avec FAC et non FAC aux cases décochées | Clic sur « Sans Validation client devis » puis « Sans validation client finale » | Pour chacun, lignes de la modale = compteur de la tuile ; aucun élément non FAC listé | P1 |
| T27 | UC3 (CA9) | Composant | Éléments FAC répartis sur Q3 / Q4, statuts et teams différents, plus des non FAC | Changer successivement trimestre, statut, team | À chaque étape : compteur = nombre de FAC dans le sous-ensemble filtré, jamais les non FAC. Cas croisé : FAC hors trimestre exclu, non FAC dans le trimestre exclu | P1 |
| T28 | UC3 (CA9) | Composant | Filtres par défaut enregistrés (Q4, statuts, team) chargés au montage | Rendre la page | La règle FAC s'applique dès le premier rendu avec les filtres par défaut ; les filtres enregistrés ne sont pas modifiés par la règle (le payload d'enregistrement reste `trimestre/statut/team`) | P2 |
| T29 | UC5 | Composant | Idem T24 | Lire le texte d'aide sous les trois compteurs | Chaque texte mentionne « FAC » (ex. regex `/FAC/`). Vérifier aussi quand le compteur vaut 0 (voir « Points à trancher » : le texte « Toutes les lignes renseignées » remplace l'aide) | P2 |
| T30 | UC6 (CA8) | Composant | Éléments non FAC sans solution doc / wireframe / etc. | Lire les tuiles des 10 autres encarts | Compteurs inchangés par rapport à l'attendu actuel (le test existant « affiche les 13 encarts » et celui sur la solution doc passent sans modification) | P1 |
| T31 | UC1 | Composant | Aucun élément FAC mais colonne présente | Rendre la page | Tuiles à 0, état « ok » ou « Aucune ligne concernée » selon décision du dev, pas de plantage ; la tuile reste cliquable et la modale affiche son état vide | P2 |
| T32 | UC1 | Composant | Colonne `Devis` absente (fixture actuelle) | Rendre la page | Tuile « Sans devis » affiche « — » (test existant `affiche les 13 encarts` inchangé) | P2 |
| T33 | UC1 | Composant | Élément FAC dont le nom est vide côté modale | Ouvrir la modale | Pas de ligne pour un nom vide (non FAC) ; aucune ligne « — » inattendue | P3 |

### E2E (Playwright)
| ID | Cas d'usage | Type | Préconditions | Étapes | Résultat attendu | Priorité |
|---|---|---|---|---|---|---|
| T34 | UC1, UC4 | E2E (hors smoke, optionnel) | Préprod, compte de test avec droit `produit` et Monday configuré | Se connecter, ouvrir Produit, cliquer sur « Sans devis » | La modale s'ouvre et son nombre de lignes égale le compteur ; tous les noms listés commencent par FAC (insensible à la casse). Ne dépend d'aucun chiffre de référence | P3 |

Décision de niveau : toute la règle (noms, casse, espaces, gates, colonnes) se teste en unitaire ; les filtres et la cohérence compteur / liste se testent en composant, car c'est le même calcul (`computeRoadmapMissingIndicators`) qui alimente la tuile et la modale (`missingItems`). Le seul E2E (T34) est optionnel : il dépend des données Monday réelles de la préprod, donc fragile, sans tag `@smoke`. À ne l'ajouter que si l'équipe veut un garde-fou sur le déploiement ; sinon se limiter aux tests Vitest.

## Correspondance avec les critères d'acceptation
| CA | Cas de test |
|---|---|
| 1 | T01, T05, T24, T25 |
| 2 | T02 |
| 3 | T03 |
| 4 | T04, T09 |
| 5 | T12, T26 |
| 6 | T13, T26 |
| 7 | T14, T15 |
| 8 | T16, T17, T30 |
| 9 | T27, T28 |
| 10 | T25, T26 |

## Non-régression impactée
- Tests existants à relire (ils doivent passer sans modification, sinon c'est un signal) : `roadmapAdoriaKpi.test.ts` (« compte les lignes vides pour liens, fichiers, listes et cases à cocher » : **les éléments y s'appellent « Tout renseigné » et « Rien renseigné », donc non FAC : l'attendu `devis` et `validationClient` = 1 va casser**. Le dev doit renommer l'élément « Rien renseigné » en « FAC … » (ou séparer les assertions), ce n'est pas une régression mais une adaptation légitime de la fixture) ; « colonne absente du board » ; `ProduitDashboard.test.tsx` (« affiche les 13 encarts », « ouvre le détail d'un encart », « filtre trimestre »).
- Les fixtures partagées `TEST_MONDAY_ITEMS` ont `Feature A` / `Feature B` (non FAC) et une colonne `Validation client` : « Sans Validation client devis » passera de 1 à 0 sur cette fixture. Aucun test existant n'asserte ce compteur, mais ne pas ajouter d'éléments FAC dans `TEST_MONDAY_ITEMS`, au risque de casser les compteurs « 1 » et « 4 » de la solution doc.
- Fonctionnalités à re-tester d'après `docs/produit-roadmap-adoria.md` : les 10 autres encarts, les gates « … requis ? », le filtre trimestre (colonne `Trimestre` seule), l'enregistrement des filtres par défaut, la modale détail, le diagramme macro vs estimation (non touché).
- Documentation à mettre à jour dans la même PR : `docs/produit-roadmap-adoria.md` (paragraphe « restrictions non reprises », qui cite aujourd'hui le préfixe `FAC` comme non reprise ; « Limites connues » ; version EN de la section des 13 tuiles).
- E2E à ajouter dans `e2e/tests/` : optionnel (T34, par ex. `e2e/tests/produit-roadmap.spec.ts`, sélecteurs par rôle / libellé, identifiants via `E2E_USER_EMAIL` / `E2E_USER_PASSWORD`, jamais contre la production). Pas de nouveau `@smoke`.

## Points à trancher avant le développement
1. **Texte d'aide** : la spec demande de mentionner FAC « par exemple dans le texte d'aide ». Le libellé n'est pas fixé et le texte actuel (`${def.hint} Sur N ligne(s).`) est remplacé par « Toutes les lignes renseignées » quand le compteur est 0, ce qui ferait disparaître la mention. Le dev choisit : mention dans `def.hint` seulement, ou aussi dans les autres états (ou dans le `title` de la tuile). T29 s'aligne sur ce choix.
2. **`applicableCount`** (le « Sur N ligne(s) ») : doit-il compter les éléments FAC seulement ou toutes les lignes filtrées ? Recommandation QA : FAC seulement, pour que « Sur N » reste cohérent avec le compteur. T19 et T31 en dépendent (état « Aucune ligne concernée » quand aucun FAC).
3. **Espace insécable et accents** : T06 et T10 figent la lecture littérale de la spec (F-A-C, `trim()` standard).

## Données de test
Pas de chiffres Monday réels. À ajouter dans `frontend/src/test/fixtures/monday.ts` sans modifier `TEST_MONDAY_ITEMS` :
- `TEST_MONDAY_FAC_COLUMNS` : colonnes de `TEST_MONDAY_COLUMNS` + `Devis` (file), `Validation clients` (checkbox) et `Jours devis` (numbers, piège de résolution).
- `TEST_MONDAY_FAC_ITEMS` : éléments avec trimestre, statut, team renseignés pour couvrir CA9 :

| Nom | Trimestre | Statut / Team | Devis | Val. client | Val. clients | Attendu |
|---|---|---|---|---|---|---|
| FAC-123 Export | Q4 | En cours / Team Cook | vide | décochée | décochée | compté dans les 3 |
| Refonte menu | Q4 | En cours / Team Cook | vide | décochée | décochée | compté dans aucun des 3 |
| fac-45 Import | Q4 | Done / Softcam | vide | décochée | cochée | `devis`, `validationClient` |
| ␣␣FAC Relance | Q4 | En cours / Softcam | vide | cochée | décochée | `devis`, `validationClients` |
| Sujet FAC | Q4 | En cours / Team Cook | vide | décochée | décochée | aucun |
| FACTURATION mensuelle | Q3 | En cours / Team Cook | vide | décochée | décochée | les 3, hors filtre Q4 |
| FAC-900 Complet | Q4 | Done / Team Cook | fichier | cochée | cochée | aucun (CA7) |
| FA | Q4 | En cours / Team Cook | vide | décochée | décochée | aucun |
| FAC | Q4 | En cours / Team Cook | vide | décochée | décochée | les 3 |
| (nom vide) | Q4 | En cours / Team Cook | vide | décochée | décochée | aucun |
| Non FAC sans doc | Q4 | En cours / Team Cook | renseigné | cochée | cochée | aucun des 3, mais compté par `solutionDoc`, `cp`, etc. (CA8) |

Pour les tests de composant, mocker `getBoard` comme dans « filtre trimestre » (`mockGetBoard.mockImplementation`) avec ces fixtures. Pour la charge (T23), générer les éléments dans le test (aucun fichier volumineux).
