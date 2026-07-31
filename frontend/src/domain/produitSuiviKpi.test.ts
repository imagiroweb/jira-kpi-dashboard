import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MondayColumn, MondayItem } from '../services/api';
import {
  buildIntegrationTimelineEvents,
  calendarDaysBetween,
  computeIntegrationsEnCours,
  computeSuiviKpis,
  formatDateYmd,
  isDefinedCaisseLabel,
  isRoadmapAdoria2026Workspace,
  isStuckRollOutStatus,
  integrationEnCoursAgeTone,
  integrationSitesProgressionPct,
  mondayMacroEstimateDiffPct,
  parseDate,
  parseNum,
  type IntegrationEnCours,
} from './produitSuiviKpi';

describe('produitSuiviKpi', () => {
  describe('isRoadmapAdoria2026Workspace', () => {
    it('détecte un workspace Roadmap Adoria 2026', () => {
      expect(isRoadmapAdoria2026Workspace('Roadmap Adoria 2026')).toBe(true);
      expect(isRoadmapAdoria2026Workspace('Espace roadmap adoria')).toBe(true);
    });

    it('retourne false pour un nom hors périmètre', () => {
      expect(isRoadmapAdoria2026Workspace('Suivi clients')).toBe(false);
      expect(isRoadmapAdoria2026Workspace('')).toBe(false);
    });
  });

  describe('mondayMacroEstimateDiffPct', () => {
    it('calcule l’écart relatif symétrique', () => {
      expect(mondayMacroEstimateDiffPct(10, 8)).toBe(20);
      expect(mondayMacroEstimateDiffPct(0, 0)).toBe(0);
    });
  });

  describe('isDefinedCaisseLabel', () => {
    it('rejette les placeholders vides', () => {
      expect(isDefinedCaisseLabel('-')).toBe(false);
      expect(isDefinedCaisseLabel('N/A')).toBe(false);
      expect(isDefinedCaisseLabel('Caisse Pro')).toBe(true);
    });
  });

  describe('parseDate / parseNum', () => {
    it('parse une date ISO', () => {
      const d = parseDate('2026-03-15');
      expect(d?.getFullYear()).toBe(2026);
    });

    it('parse un nombre avec virgule', () => {
      expect(parseNum('12,5')).toBe(12.5);
      expect(parseNum('')).toBe(0);
    });
  });

  describe('calendarDaysBetween / formatDateYmd / isStuckRollOutStatus', () => {
    it('compte les jours calendaires (diff midnight)', () => {
      expect(calendarDaysBetween(new Date(2026, 0, 1), new Date(2026, 0, 11))).toBe(10);
      expect(calendarDaysBetween(new Date(2026, 5, 1), new Date(2026, 5, 1))).toBe(0);
    });

    it('formate YYYY-MM-DD en local', () => {
      expect(formatDateYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('détecte Stuck insensible à la casse', () => {
      expect(isStuckRollOutStatus('Stuck')).toBe(true);
      expect(isStuckRollOutStatus(' stuck ')).toBe(true);
      expect(isStuckRollOutStatus('In progress')).toBe(false);
      expect(isStuckRollOutStatus(null)).toBe(false);
    });
  });

  describe('integrationEnCoursAgeTone', () => {
    it('priorise Stuck (marron) quel que soit l’âge', () => {
      expect(integrationEnCoursAgeTone(10, true)).toBe('stuck');
      expect(integrationEnCoursAgeTone(200, true)).toBe('stuck');
    });

    it('vert &lt; 90 j, jaune 90–180 j, orange &gt; 180 j', () => {
      expect(integrationEnCoursAgeTone(0, false)).toBe('fresh');
      expect(integrationEnCoursAgeTone(89, false)).toBe('fresh');
      expect(integrationEnCoursAgeTone(90, false)).toBe('warming');
      expect(integrationEnCoursAgeTone(180, false)).toBe('warming');
      expect(integrationEnCoursAgeTone(181, false)).toBe('aging');
    });
  });

  describe('integrationSitesProgressionPct', () => {
    it('retourne null si target absent ou nul', () => {
      expect(integrationSitesProgressionPct(5, 0)).toBeNull();
      expect(integrationSitesProgressionPct(5, -1)).toBeNull();
    });

    it('calcule le % sites / target plafonné à 100', () => {
      expect(integrationSitesProgressionPct(1, 10)).toBe(10);
      expect(integrationSitesProgressionPct(109, 162)).toBe(67);
      expect(integrationSitesProgressionPct(20, 10)).toBe(100);
      expect(integrationSitesProgressionPct(0, 16)).toBe(0);
    });
  });

  describe('computeIntegrationsEnCours', () => {
    const columns: MondayColumn[] = [
      { id: 'start', title: 'Project start date', type: 'date' },
      { id: 'rostart', title: 'Roll out start date (formation admin)', type: 'date' },
      { id: 'formstart', title: 'Premiere jour date de formation  sites', type: 'date' },
      { id: 'formend', title: 'Dernier jour de formation sites', type: 'date' },
      { id: 'prod', title: 'Roll out end date (lancement en production)', type: 'date' },
      { id: 'rollout', title: 'Initial roll out', type: 'status' },
      { id: 'sites', title: 'Sites actifs', type: 'numbers' },
      { id: 'target', title: 'Target', type: 'numbers' },
    ];

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 6, 31)); // 31 juil. 2026
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('liste les WIP (début ≥ n-1, sans prod), trie par âge, marque Stuck', () => {
      const items: MondayItem[] = [
        {
          id: 'old',
          name: 'Trop ancien',
          column_values: [
            { id: 'start', text: '2024-06-01', type: 'date' },
            { id: 'rostart', text: '', type: 'date' },
            { id: 'prod', text: '', type: 'date' },
            { id: 'rollout', text: 'In progress', type: 'status' },
          ],
        },
        {
          id: 'done',
          name: 'Déjà en prod',
          column_values: [
            { id: 'start', text: '2025-01-01', type: 'date' },
            { id: 'rostart', text: '2025-02-01', type: 'date' },
            { id: 'prod', text: '2025-06-01', type: 'date' },
            { id: 'rollout', text: 'Done', type: 'status' },
          ],
        },
        {
          id: 'stuck',
          name: 'Exki',
          column_values: [
            { id: 'start', text: '2025-04-02', type: 'date' },
            { id: 'rostart', text: '2025-06-01', type: 'date' },
            { id: 'formstart', text: '2025-06-10', type: 'date' },
            { id: 'formend', text: '2025-06-20', type: 'date' },
            { id: 'prod', text: '', type: 'date' },
            { id: 'rollout', text: 'Stuck', type: 'status' },
            { id: 'sites', text: '12', type: 'numbers' },
            { id: 'target', text: '18', type: 'numbers' },
          ],
        },
        {
          id: 'wip',
          name: 'Groupe DNA',
          column_values: [
            { id: 'start', text: '2026-05-31', type: 'date' },
            { id: 'rostart', text: '', type: 'date' },
            { id: 'formstart', text: '', type: 'date' },
            { id: 'formend', text: '', type: 'date' },
            { id: 'prod', text: '', type: 'date' },
            { id: 'rollout', text: 'In progress', type: 'status' },
            { id: 'sites', text: '1', type: 'numbers' },
            { id: 'target', text: '0', type: 'numbers' },
          ],
        },
      ];

      const rows = computeIntegrationsEnCours(items, columns);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        clientName: 'Exki',
        startDate: '2025-04-02',
        stuck: true,
        rollOutStatus: 'Stuck',
        sitesActifs: 12,
        targetSites: 18,
        progressionSitesPct: 67,
        rollOutStartDate: '2025-06-01',
        joursDebutToRollOut: calendarDaysBetween(new Date(2025, 3, 2), new Date(2025, 5, 1)),
        formationStartDate: '2025-06-10',
        formationEndDate: '2025-06-20',
        joursFormation: 10,
      });
      expect(rows[0].ageJours).toBe(calendarDaysBetween(new Date(2025, 3, 2), new Date(2026, 6, 31)));
      expect(rows[1]).toMatchObject({
        clientName: 'Groupe DNA',
        startDate: '2026-05-31',
        stuck: false,
        sitesActifs: 1,
        targetSites: 0,
        progressionSitesPct: null,
        rollOutStartDate: null,
        joursDebutToRollOut: null,
        formationStartDate: null,
        formationEndDate: null,
        joursFormation: null,
        ageJours: calendarDaysBetween(new Date(2026, 4, 31), new Date(2026, 6, 31)),
      });
    });

    it('retourne [] sans colonne de début', () => {
      expect(
        computeIntegrationsEnCours(
          [{ id: '1', name: 'X', column_values: [] }],
          [{ id: 'prod', title: 'Date mise en production', type: 'date' }]
        )
      ).toEqual([]);
    });
  });

  describe('computeSuiviKpis', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 1));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const columns: MondayColumn[] = [
      { id: 'sites', title: 'Sites actifs', type: 'numbers' },
      { id: 'pays', title: 'Pays', type: 'text' },
      { id: 'caisse', title: 'Système de caisse actif', type: 'text' },
      { id: 'prod', title: 'Date mise en production', type: 'date' },
      { id: 'start', title: 'Project start date', type: 'date' },
      { id: 'rollout', title: 'Initial roll out', type: 'status' },
    ];

    const items: MondayItem[] = [
      {
        id: '1',
        name: 'Client A',
        column_values: [
          { id: 'sites', text: '3', type: 'numbers' },
          { id: 'pays', text: 'France', type: 'text' },
          { id: 'caisse', text: 'Caisse X', type: 'text' },
          { id: 'prod', text: '2026-05-01', type: 'date' },
          { id: 'start', text: '2026-04-01', type: 'date' },
          { id: 'rollout', text: 'Done', type: 'status' },
        ],
      },
      {
        id: '2',
        name: 'Client B',
        column_values: [
          { id: 'sites', text: '2', type: 'numbers' },
          { id: 'pays', text: 'France', type: 'text' },
          { id: 'caisse', text: '-', type: 'text' },
          { id: 'prod', text: '2026-06-10', type: 'date' },
          { id: 'start', text: '2026-05-01', type: 'date' },
          { id: 'rollout', text: 'Done', type: 'status' },
        ],
      },
      {
        id: '3',
        name: 'Client WIP',
        column_values: [
          { id: 'sites', text: '0', type: 'numbers' },
          { id: 'pays', text: 'Belgique', type: 'text' },
          { id: 'caisse', text: 'Zelty', type: 'text' },
          { id: 'prod', text: '', type: 'date' },
          { id: 'start', text: '2026-03-01', type: 'date' },
          { id: 'rollout', text: 'Stuck', type: 'status' },
        ],
      },
    ];

    it('agrège sites actifs, pays et nuage de caisse', () => {
      const k = computeSuiviKpis(items, columns);
      expect(k.sitesActifs).toBe(5);
      expect(k.totalProjets).toBe(3);
      expect(k.byPays.find((p) => p.name === 'France')?.value).toBe(2);
      expect(k.systemeCaisseWordCloud).toEqual([
        { label: 'Caisse X', count: 1 },
        { label: 'Zelty', count: 1 },
      ]);
      expect(k.projetsAnneeEnCours).toBe(2);
    });

    it('calcule la progression sites actifs / target', () => {
      const cols: MondayColumn[] = [
        { id: 'sites', title: 'Sites actifs', type: 'numbers' },
        { id: 'target', title: 'Target', type: 'numbers' },
      ];
      const k = computeSuiviKpis(
        [
          {
            id: '1',
            name: 'A',
            column_values: [
              { id: 'sites', text: '5', type: 'numbers' },
              { id: 'target', text: '20', type: 'numbers' },
            ],
          },
          {
            id: '2',
            name: 'B',
            column_values: [
              { id: 'sites', text: '5', type: 'numbers' },
              { id: 'target', text: '20', type: 'numbers' },
            ],
          },
        ],
        cols
      );
      expect(k.sitesActifs).toBe(10);
      expect(k.target).toBe(40);
      expect(k.sitesProgressionPct).toBe(25);
    });

    it('calcule la progression utilisateurs actifs / bruts', () => {
      const cols: MondayColumn[] = [
        { id: 'ua', title: "KPI Adoria - Nbre d'utilisateurs actifs", type: 'numbers' },
        { id: 'ub', title: "KPI Adoria - Nbre d'utilisateurs bruts", type: 'numbers' },
      ];
      const k = computeSuiviKpis(
        [
          {
            id: '1',
            name: 'A',
            column_values: [
              { id: 'ua', text: '20', type: 'numbers' },
              { id: 'ub', text: '50', type: 'numbers' },
            ],
          },
          {
            id: '2',
            name: 'B',
            column_values: [
              { id: 'ua', text: '30', type: 'numbers' },
              { id: 'ub', text: '50', type: 'numbers' },
            ],
          },
        ],
        cols
      );
      expect(k.totalUtilisateursActifs).toBe(50);
      expect(k.totalUtilisateursBruts).toBe(100);
      expect(k.utilisateursProgressionPct).toBe(50);
    });

    it('calcule les délais de mise en prod', () => {
      const k = computeSuiviKpis(items, columns);
      expect(k.delaiByClient).toHaveLength(2);
      expect(k.dureeMinMiseEnProdJours).toBeGreaterThan(0);
    });

    it('expose les intégrations en cours avec agrégats', () => {
      const k = computeSuiviKpis(items, columns);
      expect(k.integrationsEnCours).toHaveLength(1);
      expect(k.integrationsEnCours[0]).toMatchObject({
        clientName: 'Client WIP',
        stuck: true,
        startDate: '2026-03-01',
        sitesActifs: 0,
        targetSites: 0,
        progressionSitesPct: null,
      });
      expect(k.integrationsEnCoursStuckCount).toBe(1);
      expect(k.integrationsEnCoursAgeMedianJours).toBe(k.integrationsEnCours[0].ageJours);
      expect(k.integrationsEnCoursAgeMoyenJours).toBe(k.integrationsEnCours[0].ageJours);
    });

    it('agrège CDC : sites déployés, commandes, target des projets CDC et progression', () => {
      const cols: MondayColumn[] = [
        ...columns,
        { id: 'target', title: 'Target', type: 'numbers' },
        { id: 'cdc', title: 'CDC déployé', type: 'numbers' },
        {
          id: 'cmd',
          title: 'KPI Adoria - Nombre de commandes générées via le CDC',
          type: 'numbers',
        },
      ];
      const cdcItems: MondayItem[] = [
        {
          id: 'a',
          name: 'Avec CDC',
          column_values: [
            { id: 'cdc', text: '10', type: 'numbers' },
            { id: 'cmd', text: '40', type: 'numbers' },
            { id: 'target', text: '25', type: 'numbers' },
          ],
        },
        {
          id: 'b',
          name: 'Avec CDC 2',
          column_values: [
            { id: 'cdc', text: '5', type: 'numbers' },
            { id: 'cmd', text: '12', type: 'numbers' },
            { id: 'target', text: '10', type: 'numbers' },
          ],
        },
        {
          id: 'c',
          name: 'Sans CDC',
          column_values: [
            { id: 'cdc', text: '0', type: 'numbers' },
            { id: 'cmd', text: '0', type: 'numbers' },
            { id: 'target', text: '100', type: 'numbers' },
          ],
        },
      ];
      const k = computeSuiviKpis(cdcItems, cols);
      expect(k.cdcDeploye).toBe(15);
      expect(k.totalCommandesViaCdc).toBe(52);
      expect(k.cdcTargetSites).toBe(35);
      expect(k.cdcProjetsCount).toBe(2);
      expect(k.cdcProgressionPct).toBe(43);
      expect(k.target).toBe(135);
    });
  });

  describe('buildIntegrationTimelineEvents', () => {
    const baseRow: IntegrationEnCours = {
      itemId: '1',
      clientName: 'Acme',
      startDate: '2026-01-01',
      ageJours: 100,
      stuck: false,
      rollOutStatus: null,
      sitesActifs: 2,
      targetSites: 10,
      progressionSitesPct: 20,
      rollOutStartDate: '2026-01-21',
      joursDebutToRollOut: 20,
      formationStartDate: '2026-02-01',
      formationEndDate: '2026-02-05',
      joursFormation: 4,
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 3, 11)); // 11 avril 2026
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('ancre les évènements sur le début (J+0) et trie par offset', () => {
      const events = buildIntegrationTimelineEvents(baseRow);
      expect(events.map((e) => e.id)).toEqual([
        'start',
        'rollout',
        'formationStart',
        'formationEnd',
        'today',
      ]);
      expect(events[0]).toMatchObject({ label: 'Début projet', offsetJours: 0, date: '2026-01-01' });
      expect(events.find((e) => e.id === 'rollout')).toMatchObject({ offsetJours: 20 });
      expect(events.find((e) => e.id === 'formationStart')).toMatchObject({ offsetJours: 31 });
      expect(events.find((e) => e.id === 'formationEnd')).toMatchObject({ offsetJours: 35 });
      expect(events.find((e) => e.id === 'today')).toMatchObject({
        offsetJours: 100,
        date: '2026-04-11',
      });
    });

    it('omet les dates absentes mais garde début et aujourd’hui', () => {
      const events = buildIntegrationTimelineEvents({
        ...baseRow,
        rollOutStartDate: null,
        joursDebutToRollOut: null,
        formationStartDate: null,
        formationEndDate: null,
        joursFormation: null,
      });
      expect(events.map((e) => e.id)).toEqual(['start', 'today']);
    });
  });
});
