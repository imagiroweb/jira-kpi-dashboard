import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MondayColumn, MondayItem } from '../services/api';
import {
  computeSuiviKpis,
  isDefinedCaisseLabel,
  isRoadmapAdoria2026Workspace,
  mondayMacroEstimateDiffPct,
  parseDate,
  parseNum,
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
        ],
      },
    ];

    it('agrège sites actifs, pays et nuage de caisse', () => {
      const k = computeSuiviKpis(items, columns);
      expect(k.sitesActifs).toBe(5);
      expect(k.totalProjets).toBe(2);
      expect(k.byPays.find((p) => p.name === 'France')?.value).toBe(2);
      expect(k.systemeCaisseWordCloud).toEqual([{ label: 'Caisse X', count: 1 }]);
      expect(k.projetsAnneeEnCours).toBe(2);
    });

    it('calcule les délais de mise en prod', () => {
      const k = computeSuiviKpis(items, columns);
      expect(k.delaiByClient).toHaveLength(2);
      expect(k.dureeMinMiseEnProdJours).toBeGreaterThan(0);
    });
  });
});
