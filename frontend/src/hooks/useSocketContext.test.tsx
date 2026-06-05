import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { useSocketContext, useSocketOptional } from './useSocketContext';

function ContextProbe() {
  const ctx = useSocketContext();
  return (
    <div>
      <span data-testid="connected">{String(ctx.isConnected)}</span>
      <span data-testid="clients">{ctx.clientsCount}</span>
    </div>
  );
}

describe('useSocketContext', () => {
  it('lève une erreur si utilisé hors SocketProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSocketContext())).toThrow(
      'useSocketContext must be used within a SocketProvider'
    );
    consoleError.mockRestore();
  });

  it('retourne null avec useSocketOptional hors provider', () => {
    const { result } = renderHook(() => useSocketOptional());
    expect(result.current).toBeNull();
  });

  it('retourne la valeur du contexte mocké via renderWithProviders', () => {
    const { getByTestId } = renderWithProviders(<ContextProbe />, {
      socket: { isConnected: true, clientsCount: 7 },
    });

    expect(getByTestId('connected').textContent).toBe('true');
    expect(getByTestId('clients').textContent).toBe('7');
  });
});
