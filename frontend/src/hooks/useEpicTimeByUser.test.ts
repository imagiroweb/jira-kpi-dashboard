import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', () => ({
  epicApi: { getTimeByUser: vi.fn() },
}));

import { epicApi } from '../services/api';
import { useEpicTimeByUser } from './useEpicTimeByUser';

const mockGetTimeByUser = vi.mocked(epicApi.getTimeByUser);
const RESPONSE = { success: true, epicKey: 'AD-1', issueCount: 1, totalSeconds: 60, people: [], byRole: [] };

describe('useEpicTimeByUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("charge le temps par personne de l'épic", async () => {
    mockGetTimeByUser.mockResolvedValue(RESPONSE);

    const { result } = renderHook(() => useEpicTimeByUser('AD-1'));

    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual(RESPONSE));
    expect(result.current.error).toBeNull();
    expect(mockGetTimeByUser).toHaveBeenCalledWith('AD-1');
  });

  it("renvoie un message d'erreur si le chargement échoue", async () => {
    mockGetTimeByUser.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useEpicTimeByUser('AD-1'));

    await waitFor(() => expect(result.current.error).toMatch(/Impossible de charger/));
    expect(result.current.data).toBeNull();
  });

  it("recharge quand l'épic change", async () => {
    mockGetTimeByUser.mockResolvedValue(RESPONSE);

    const { rerender } = renderHook(({ key }) => useEpicTimeByUser(key), { initialProps: { key: 'AD-1' } });
    rerender({ key: 'AD-2' });

    await waitFor(() => expect(mockGetTimeByUser).toHaveBeenLastCalledWith('AD-2'));
  });
});
