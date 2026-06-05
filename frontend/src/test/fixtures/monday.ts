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
  { id: 'pm', title: 'PM', type: 'text' },
  { id: 'st', title: 'Statut', type: 'status' },
  { id: 'macro', title: 'Macro chiffrage', type: 'numbers' },
];

export const TEST_MONDAY_ITEMS: MondayItem[] = [
  {
    id: 'item-1',
    name: 'Feature A',
    column_values: [
      { id: 'date', text: '2026-01-01 - 2026-03-31', type: 'text' },
      { id: 'pm', text: 'Bob', type: 'text' },
      { id: 'st', text: 'En cours', type: 'status' },
      { id: 'macro', text: '10', type: 'numbers' },
    ],
  },
  {
    id: 'item-2',
    name: 'Feature B',
    column_values: [
      { id: 'date', text: '2026-04-01 - 2026-06-30', type: 'text' },
      { id: 'pm', text: 'Alice', type: 'text' },
      { id: 'st', text: 'Done', type: 'status' },
      { id: 'macro', text: '5', type: 'numbers' },
    ],
  },
];
