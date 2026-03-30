import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MondayColumn, MondayItem } from '../services/api';
import {
  EMPTY_ROADMAP_KPIS,
  calendarDaysInclusiveFromTodayToQuarterEnd,
  calendarQuarterFromDate,
  classifyRoadmapKanbanBucket,
  computeRoadmapKpis,
  findColumnByKeywords,
  findColumnPreferSpecific,
  findRoadmapDateColumn,
  findRoadmapPmColumn,
  getMondayItemNumericValue,
  getQuarterEndDate,
  getRoadmapDateColumnRaw,
  isRoadmapNumericKpiValueMissing,
  isRoadmapSolutionDocValueMissing,
  isRoadmapStatusDone,
  isRoadmapStatusTodo,
  parseMondayDateString,
  parseRoadmapDateColumnEndDate,
  parseRoadmapDateColumnRange,
  resolveRoadmapMacroEstimationColumns,
  roadmapRangeFullyInQuarter,
  roadmapRangeFullyInQuarterCurrentYear,
} from './roadmapAdoriaKpi';

describe('roadmapAdoriaKpi', () => {
  describe('parseMondayDateString', () => {
    it('parse une date ISO YYYY-MM-DD en local', () => {
      const d = parseMondayDateString('2026-03-15');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(2);
      expect(d!.getDate()).toBe(15);
    });

    it('retourne null pour chaîne vide', () => {
      expect(parseMondayDateString('')).toBeNull();
    });
  });

  describe('parseRoadmapDateColumnRange', () => {
    it('extrait début et fin pour une plage à deux ISO', () => {
      const { start, end } = parseRoadmapDateColumnRange('2025-08-18 - 2026-01-16');
      expect(start!.getFullYear()).toBe(2025);
      expect(start!.getMonth()).toBe(7);
      expect(end!.getFullYear()).toBe(2026);
      expect(end!.getMonth()).toBe(0);
    });

    it('une seule date duplique début et fin', () => {
      const { start, end } = parseRoadmapDateColumnRange('2026-02-01');
      expect(start!.getTime()).toBe(end!.getTime());
    });
  });

  describe('parseRoadmapDateColumnEndDate', () => {
    it('prend la 2ᵉ date sur une plage', () => {
      const d = parseRoadmapDateColumnEndDate('2025-08-18 - 2026-01-16');
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(0);
    });
  });

  describe('calendarQuarterFromDate', () => {
    it('Q1–Q4 calendaires', () => {
      expect(calendarQuarterFromDate(new Date(2026, 0, 1))).toBe(1);
      expect(calendarQuarterFromDate(new Date(2026, 3, 1))).toBe(2);
      expect(calendarQuarterFromDate(new Date(2026, 6, 1))).toBe(3);
      expect(calendarQuarterFromDate(new Date(2026, 11, 31))).toBe(4);
    });
  });

  describe('roadmapRangeFullyInQuarter', () => {
    it('true si les deux dates sont dans le même trimestre et la même année', () => {
      const start = new Date(2026, 0, 10);
      const end = new Date(2026, 2, 20);
      expect(roadmapRangeFullyInQuarter(start, end, 1)).toBe(true);
    });

    it('false si la plage chevauche deux trimestres', () => {
      const start = new Date(2025, 11, 1);
      const end = new Date(2026, 1, 1);
      expect(roadmapRangeFullyInQuarter(start, end, 1)).toBe(false);
    });

    it('false si années différentes', () => {
      const start = new Date(2025, 2, 1);
      const end = new Date(2026, 2, 1);
      expect(roadmapRangeFullyInQuarter(start, end, 1)).toBe(false);
    });
  });

  describe('roadmapRangeFullyInQuarterCurrentYear', () => {
    it('false si année des dates ≠ année courante du filtre', () => {
      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 2, 1);
      expect(roadmapRangeFullyInQuarterCurrentYear(start, end, 1, 2026)).toBe(false);
    });

    it('true si trimestre OK et année = currentYear', () => {
      const start = new Date(2026, 0, 1);
      const end = new Date(2026, 2, 28);
      expect(roadmapRangeFullyInQuarterCurrentYear(start, end, 1, 2026)).toBe(true);
    });
  });

  describe('getQuarterEndDate', () => {
    it('Q1 se termine le 31 mars', () => {
      const d = getQuarterEndDate(2026, 1);
      expect(d.getMonth()).toBe(2);
      expect(d.getDate()).toBe(31);
    });
  });

  describe('calendarDaysInclusiveFromTodayToQuarterEnd', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('compte les jours calendaires inclusifs jusqu’à fin de trimestre (hors période DST)', () => {
      vi.setSystemTime(new Date(2026, 11, 27));
      const qEnd = getQuarterEndDate(2026, 4);
      const n = calendarDaysInclusiveFromTodayToQuarterEnd(new Date(), qEnd);
      expect(n).toBe(5);
    });
  });

  describe('findRoadmapDateColumn / findRoadmapPmColumn / findColumnByKeywords', () => {
    const columns: MondayColumn[] = [
      { id: 'd1', title: 'DATE', type: 'text' },
      { id: 'pm1', title: 'PM', type: 'text' },
      { id: 'st', title: 'Statut', type: 'status' },
    ];

    it('DATE titre exact', () => {
      expect(findRoadmapDateColumn(columns)?.id).toBe('d1');
    });

    it('PM titre exact', () => {
      expect(findRoadmapPmColumn(columns)?.id).toBe('pm1');
    });

    it('findColumnByKeywords statut', () => {
      expect(findColumnByKeywords(columns, ['statut'])?.id).toBe('st');
    });
  });

  describe('isRoadmapStatusDone / isRoadmapStatusTodo', () => {
    it('done : terminé, Done, validé…', () => {
      expect(isRoadmapStatusDone('Terminé')).toBe(true);
      expect(isRoadmapStatusDone('Done')).toBe(true);
      expect(isRoadmapStatusDone('En cours')).toBe(false);
    });

    it('todo : à faire, backlog…', () => {
      expect(isRoadmapStatusTodo('To do')).toBe(true);
      expect(isRoadmapStatusTodo('Backlog')).toBe(true);
      expect(isRoadmapStatusTodo('Terminé')).toBe(false);
    });
  });

  describe('classifyRoadmapKanbanBucket', () => {
    const colDate: MondayColumn = { id: 'date', title: 'DATE', type: 'text' };
    const colSt: MondayColumn = { id: 'st', title: 'Statut', type: 'status' };

    it('retard si fin DATE avant aujourd’hui et non done', () => {
      const item: MondayItem = {
        id: '1',
        name: 'P1',
        column_values: [
          { id: 'date', text: '2020-01-01 - 2020-02-01', type: 'text' },
          { id: 'st', text: 'En cours', type: 'status' },
        ],
      };
      const now = new Date(2026, 5, 1);
      expect(classifyRoadmapKanbanBucket(item, colSt, colDate, now)).toBe('retard');
    });

    it('done prioritaire sur retard si statut terminé', () => {
      const item: MondayItem = {
        id: '2',
        name: 'P2',
        column_values: [
          { id: 'date', text: '2020-01-01 - 2020-02-01', type: 'text' },
          { id: 'st', text: 'Terminé', type: 'status' },
        ],
      };
      const now = new Date(2026, 5, 1);
      expect(classifyRoadmapKanbanBucket(item, colSt, colDate, now)).toBe('done');
    });
  });

  describe('getRoadmapDateColumnRaw', () => {
    it('lit text sur la colonne', () => {
      const item: MondayItem = {
        id: '1',
        name: 'X',
        column_values: [{ id: 'c1', text: '2026-01-01 - 2026-03-01', type: 'text' }],
      };
      expect(getRoadmapDateColumnRaw(item, 'c1')).toContain('2026-01-01');
    });
  });

  describe('isRoadmapSolutionDocValueMissing', () => {
    it('vide ou tiret', () => {
      expect(isRoadmapSolutionDocValueMissing('')).toBe(true);
      expect(isRoadmapSolutionDocValueMissing('-')).toBe(true);
      expect(isRoadmapSolutionDocValueMissing('  ')).toBe(true);
      expect(isRoadmapSolutionDocValueMissing('Doc OK')).toBe(false);
    });
  });

  describe('computeRoadmapKpis', () => {
    const columns: MondayColumn[] = [
      { id: 'cp', title: 'CP RÉFÉRENT', type: 'text' },
      { id: 'sol', title: 'SOLUTION DOC', type: 'text' },
      { id: 'macro', title: 'Macro chiffrage', type: 'numbers' },
      { id: 'est', title: 'Estimation', type: 'numbers' },
      { id: 'pm', title: 'PM', type: 'text' },
      { id: 'st', title: 'Statut', type: 'status' },
    ];

    const items: MondayItem[] = [
      {
        id: '1',
        name: 'A',
        column_values: [
          { id: 'cp', text: 'Alice', type: 'text' },
          { id: 'sol', text: 'https://doc', type: 'text' },
          { id: 'macro', text: '10', type: 'numbers' },
          { id: 'est', text: '8', type: 'numbers' },
          { id: 'pm', text: 'Bob', type: 'text' },
          { id: 'st', text: 'Done', type: 'status' },
        ],
      },
      {
        id: '2',
        name: 'B',
        column_values: [
          { id: 'cp', text: '', type: 'text' },
          { id: 'sol', text: '-', type: 'text' },
          { id: 'macro', text: '', type: 'numbers' },
          { id: 'est', text: '-', type: 'numbers' },
          { id: 'pm', text: '', type: 'text' },
          { id: 'st', text: 'To do', type: 'status' },
        ],
      },
    ];

    it('agrège CP, PM (Non attribués), statuts', () => {
      const k = computeRoadmapKpis(items, columns);
      expect(k).not.toBeNull();
      expect(k!.totalFeatures).toBe(2);
      expect(k!.withCpReferent).toBe(1);
      expect(k!.missingCpReferent).toBe(1);
      expect(k!.hasSolutionDocColumn).toBe(true);
      expect(k!.missingSolutionDoc).toBe(1);
      expect(k!.hasMacroChiffrageColumn).toBe(true);
      expect(k!.hasEstimationColumn).toBe(true);
      expect(k!.missingMacroChiffrage).toBe(1);
      expect(k!.missingEstimation).toBe(1);
      const pmBob = k!.byPm.find((x) => x.name === 'Bob');
      const pmNa = k!.byPm.find((x) => x.name === 'Non attribués');
      expect(pmBob?.count).toBe(1);
      expect(pmNa?.count).toBe(1);
      expect(k!.byStatus.some((s) => s.name === 'Done')).toBe(true);
    });

    it('retourne null si aucun item', () => {
      expect(computeRoadmapKpis([], columns)).toBeNull();
    });

    it('sans colonnes macro / estimation : flags false et compteurs à 0', () => {
      const colsMinimal: MondayColumn[] = [
        { id: 'cp', title: 'CP RÉFÉRENT', type: 'text' },
        { id: 'st', title: 'Statut', type: 'status' },
      ];
      const oneItem: MondayItem[] = [
        {
          id: '1',
          name: 'Seul',
          column_values: [
            { id: 'cp', text: 'X', type: 'text' },
            { id: 'st', text: 'Done', type: 'status' },
          ],
        },
      ];
      const k = computeRoadmapKpis(oneItem, colsMinimal);
      expect(k).not.toBeNull();
      expect(k!.hasMacroChiffrageColumn).toBe(false);
      expect(k!.hasEstimationColumn).toBe(false);
      expect(k!.missingMacroChiffrage).toBe(0);
      expect(k!.missingEstimation).toBe(0);
    });

    it('macro / estimation JSON Monday numbers : 0 compte comme manquant', () => {
      const cols: MondayColumn[] = [
        { id: 'cp', title: 'CP RÉFÉRENT', type: 'text' },
        { id: 'macro', title: 'Macro chiffrage', type: 'numbers' },
        { id: 'est', title: 'Estimation', type: 'numbers' },
        { id: 'st', title: 'Statut', type: 'status' },
      ];
      const items: MondayItem[] = [
        {
          id: '1',
          name: 'Zéro',
          column_values: [
            { id: 'cp', text: 'A', type: 'text' },
            {
              id: 'macro',
              text: '0',
              value: '{"number":"0"}',
              type: 'numbers',
            },
            {
              id: 'est',
              text: '2',
              value: '{"number":"2"}',
              type: 'numbers',
            },
            { id: 'st', text: 'To do', type: 'status' },
          ],
        },
      ];
      const k = computeRoadmapKpis(items, cols);
      expect(k!.missingMacroChiffrage).toBe(1);
      expect(k!.missingEstimation).toBe(0);
    });
  });

  describe('findColumnPreferSpecific', () => {
    it('essaie le mot-clé le plus long en premier (évite faux positifs courts)', () => {
      const columns: MondayColumn[] = [
        { id: 'wide', title: 'Chiffrage initial draft', type: 'numbers' },
        { id: 'narrow', title: 'Estimation', type: 'numbers' },
      ];
      const col = findColumnPreferSpecific(columns, ['chiffrage initial', 'estimation']);
      expect(col?.id).toBe('wide');
    });
  });

  describe('getMondayItemNumericValue', () => {
    const colId = 'num';

    it('0 si colonne absente ou vide', () => {
      const item: MondayItem = { id: '1', name: 'X', column_values: [] };
      expect(getMondayItemNumericValue(item, colId)).toBe(0);
    });

    it('parse le texte (virgule décimale, pourcentage)', () => {
      const item: MondayItem = {
        id: '1',
        name: 'X',
        column_values: [{ id: colId, text: '12,5 %', type: 'numbers' }],
      };
      expect(getMondayItemNumericValue(item, colId)).toBe(12.5);
    });

    it('lit JSON value type Monday numbers', () => {
      const item: MondayItem = {
        id: '1',
        name: 'X',
        column_values: [
          {
            id: colId,
            text: '',
            value: '{"number":"7"}',
            type: 'numbers',
          },
        ],
      };
      expect(getMondayItemNumericValue(item, colId)).toBe(7);
    });

    it('accepte value numérique brute si l’API la renvoie ainsi (runtime)', () => {
      const item: MondayItem = {
        id: '1',
        name: 'X',
        column_values: [{ id: colId, text: '', type: 'numbers' }],
      };
      (item.column_values![0] as { value?: unknown }).value = 4;
      expect(getMondayItemNumericValue(item, colId)).toBe(4);
    });
  });

  describe('resolveRoadmapMacroEstimationColumns', () => {
    it('résout deux colonnes distinctes', () => {
      const columns: MondayColumn[] = [
        { id: 'm', title: 'Macro chiffrage', type: 'numbers' },
        { id: 'e', title: 'Estimation', type: 'numbers' },
      ];
      const { macro, est } = resolveRoadmapMacroEstimationColumns(columns);
      expect(macro?.id).toBe('m');
      expect(est?.id).toBe('e');
    });

    it('n’utilise pas la même colonne pour les deux rôles', () => {
      const columns: MondayColumn[] = [
        { id: 'only', title: 'Macro chiffrage et estimation', type: 'numbers' },
        { id: 'est2', title: 'Jours estimés', type: 'numbers' },
      ];
      const { macro, est } = resolveRoadmapMacroEstimationColumns(columns);
      expect(macro?.id).toBe('only');
      expect(est?.id).toBe('est2');
    });
  });

  describe('isRoadmapNumericKpiValueMissing', () => {
    const col: MondayColumn = { id: 'n', title: 'Macro chiffrage', type: 'numbers' };

    it('false si pas de colonne (N/A encart)', () => {
      const item: MondayItem = { id: '1', name: 'X', column_values: [] };
      expect(isRoadmapNumericKpiValueMissing(item, null)).toBe(false);
    });

    it('true si vide, tiret, 0 ou non numérique', () => {
      const empty: MondayItem = {
        id: '1',
        name: 'A',
        column_values: [{ id: 'n', text: '', type: 'numbers' }],
      };
      const dash: MondayItem = {
        id: '2',
        name: 'B',
        column_values: [{ id: 'n', text: '-', type: 'numbers' }],
      };
      const zero: MondayItem = {
        id: '3',
        name: 'C',
        column_values: [{ id: 'n', text: '0', type: 'numbers' }],
      };
      expect(isRoadmapNumericKpiValueMissing(empty, col)).toBe(true);
      expect(isRoadmapNumericKpiValueMissing(dash, col)).toBe(true);
      expect(isRoadmapNumericKpiValueMissing(zero, col)).toBe(true);
    });

    it('false si valeur strictement positive', () => {
      const item: MondayItem = {
        id: '1',
        name: 'OK',
        column_values: [{ id: 'n', text: '3,5', type: 'numbers' }],
      };
      expect(isRoadmapNumericKpiValueMissing(item, col)).toBe(false);
    });
  });

  describe('EMPTY_ROADMAP_KPIS', () => {
    it('expose les champs macro / estimation pour l’UI (filtre vide)', () => {
      expect(EMPTY_ROADMAP_KPIS.missingMacroChiffrage).toBe(0);
      expect(EMPTY_ROADMAP_KPIS.missingEstimation).toBe(0);
      expect(EMPTY_ROADMAP_KPIS.hasMacroChiffrageColumn).toBe(false);
      expect(EMPTY_ROADMAP_KPIS.hasEstimationColumn).toBe(false);
    });
  });
});
