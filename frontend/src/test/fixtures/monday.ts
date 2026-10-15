import type { MondayBoard, MondayColumn, MondayItem, MondayUser, MondayWorkspace } from '@/services/api';

export const TEST_MONDAY_USER: MondayUser = {
  id: 1,
  name: 'Alice Test',
  email: 'alice@test.com',
};

export const TEST_MONDAY_WORKSPACES: MondayWorkspace[] = [
  { id: 'ws-1', name: 'Workspace Test', kind: 'open' },
];

export const TEST_MONDAY_BOARDS: MondayBoard[] = [
  { id: 'board-1', name: 'Roadmap Produit', state: 'active', boardKind: 'public', itemCount: 2, workspaceId: 'ws-1' },
];

export const TEST_MONDAY_COLUMNS: MondayColumn[] = [
  { id: 'date', title: 'DATE', type: 'text' },
  { id: 'trimestre', title: 'Trimestre', type: 'status' },
  { id: 'pm', title: 'PM', type: 'text' },
  { id: 'st', title: 'Statut', type: 'status' },
  { id: 'team', title: 'Team', type: 'status' },
  { id: 'macro', title: 'Macro chiffrage', type: 'numbers' },
  { id: 'sol', title: 'Solution doc', type: 'link' },
  { id: 'wfRequis', title: 'Wireframe requis ?', type: 'status' },
  { id: 'wf', title: 'Wireframe', type: 'link' },
  { id: 'valClient', title: 'Validation client', type: 'checkbox' },
];

export const TEST_MONDAY_ITEMS: MondayItem[] = [
  {
    id: 'item-1',
    name: 'Feature A',
    column_values: [
      { id: 'date', text: '2026-01-01 - 2026-03-31', type: 'text' },
      { id: 'trimestre', text: 'Q1', type: 'status' },
      { id: 'pm', text: 'Bob', type: 'text' },
      { id: 'st', text: 'En cours', type: 'status' },
      { id: 'team', text: 'Team Cook', type: 'status' },
      { id: 'macro', text: '10', type: 'numbers' },
      { id: 'sol', text: 'Solution doc - https://wiki/a', type: 'link' },
      { id: 'wfRequis', text: 'OUI', type: 'status' },
      { id: 'wf', text: '', type: 'link' },
      { id: 'valClient', text: 'v', value: '{"checked":true}', type: 'checkbox' },
    ],
  },
  {
    id: 'item-2',
    name: 'Feature B',
    column_values: [
      { id: 'date', text: '2026-04-01 - 2026-06-30', type: 'text' },
      { id: 'trimestre', text: 'Q2', type: 'status' },
      { id: 'pm', text: 'Alice', type: 'text' },
      { id: 'st', text: 'Done', type: 'status' },
      { id: 'team', text: 'Softcam', type: 'status' },
      { id: 'macro', text: '5', type: 'numbers' },
      { id: 'sol', text: '', type: 'link' },
      { id: 'wfRequis', text: 'NON', type: 'status' },
      { id: 'wf', text: '', type: 'link' },
      { id: 'valClient', text: '', value: '{"checked":false}', type: 'checkbox' },
    ],
  },
];

/** Board avec les colonnes des encarts FAC (« Sans devis », « Sans validation client(s) »). */
export const TEST_MONDAY_FAC_COLUMNS: MondayColumn[] = [
  ...TEST_MONDAY_COLUMNS,
  { id: 'joursDevis', title: 'Jours devis', type: 'numbers' },
  { id: 'devis', title: 'Devis', type: 'file' },
  { id: 'valClients', title: 'Validation clients', type: 'checkbox' },
];

const facItem = (
  id: string,
  name: string,
  { trimestre = 'Q4', statut = 'En cours', team = 'Team Cook', devis = '', valClient = false, valClients = false } = {}
): MondayItem => ({
  id,
  name,
  column_values: [
    { id: 'trimestre', text: trimestre, type: 'status' },
    { id: 'st', text: statut, type: 'status' },
    { id: 'team', text: team, type: 'status' },
    { id: 'sol', text: '', type: 'link' },
    { id: 'devis', text: devis, type: 'file' },
    { id: 'valClient', text: valClient ? 'v' : '', value: `{"checked":${valClient}}`, type: 'checkbox' },
    { id: 'valClients', text: valClients ? 'v' : '', value: `{"checked":${valClients}}`, type: 'checkbox' },
  ],
});

/**
 * Éléments FAC / non FAC. En Q4 : « Sans devis » = 4 (FAC-123, fac-45, FAC Relance, FAC),
 * « Sans Validation client devis » = 3 (FAC-123, fac-45, FAC), « Sans validation client finale » = 3
 * (FAC-123, FAC Relance, FAC). Toutes les lignes ont une solution doc vide (10 en tout, 9 en Q4).
 */
export const TEST_MONDAY_FAC_ITEMS: MondayItem[] = [
  facItem('fac-1', 'FAC-123 Export'),
  facItem('fac-2', 'Refonte menu'),
  facItem('fac-3', 'fac-45 Import', { statut: 'Done', team: 'Softcam', valClients: true }),
  facItem('fac-4', '  FAC Relance', { team: 'Softcam', valClient: true }),
  facItem('fac-5', 'Sujet FAC'),
  facItem('fac-6', 'FACTURATION mensuelle', { trimestre: 'Q3' }),
  facItem('fac-7', 'FAC-900 Complet', { statut: 'Done', devis: 'devis.pdf', valClient: true, valClients: true }),
  facItem('fac-8', 'FA'),
  facItem('fac-9', 'FAC'),
  facItem('fac-10', ''),
];
