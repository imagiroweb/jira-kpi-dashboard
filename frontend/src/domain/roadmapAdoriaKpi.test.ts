import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MondayColumn, MondayItem } from '../services/api';
import {
  calendarDaysInclusiveFromTodayToQuarterEnd,
  calendarQuarterFromDate,
  classifyRoadmapKanbanBucket,
  computeRoadmapKpis,
  findColumnByKeywords,
  findRoadmapDateColumn,
  findRoadmapPmColumn,
  getQuarterEndDate,
  getRoadmapDateColumnRaw,
  isRoadmapStatusDone,
  isRoadmapStatusTodo,
  parseMondayDateString,
  parseRoadmapDateColumnEndDate,
  parseRoadmapDateColumnRange,
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

  describe('computeRoadmapKpis', () => {
    const columns: MondayColumn[] = [
      { id: 'cp', title: 'CP RÉFÉRENT', type: 'text' },
      { id: 'pm', title: 'PM', type: 'text' },
      { id: 'st', title: 'Statut', type: 'status' },
    ];

    const items: MondayItem[] = [
      {
        id: '1',
        name: 'A',
        column_values: [
          { id: 'cp', text: 'Alice', type: 'text' },
          { id: 'pm', text: 'Bob', type: 'text' },
          { id: 'st', text: 'Done', type: 'status' },
        ],
      },
      {
        id: '2',
        name: 'B',
        column_values: [
          { id: 'cp', text: '', type: 'text' },
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
      const pmBob = k!.byPm.find((x) => x.name === 'Bob');
      const pmNa = k!.byPm.find((x) => x.name === 'Non attribués');
      expect(pmBob?.count).toBe(1);
      expect(pmNa?.count).toBe(1);
      expect(k!.byStatus.some((s) => s.name === 'Done')).toBe(true);
    });

    it('retourne null si aucun item', () => {
      expect(computeRoadmapKpis([], columns)).toBeNull();
    });
  });
});
