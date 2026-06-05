import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Stub global recharts — évite les crashs jsdom sur les dashboards (Phase 1+)
vi.mock('recharts', async () => {
  const { createRechartsMock } = await import('./mocks/recharts');
  return createRechartsMock();
});
