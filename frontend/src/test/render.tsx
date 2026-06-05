import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import SocketContext from '@/contexts/SocketContext';
import type { User } from '@/store/useStore';
import { createMockSocketContextValue, type MockSocketContextValue } from './mocks/socket';
import { resetStore, seedAuthenticatedUser } from './mocks/store';

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Route initiale MemoryRouter (défaut `/`) */
  route?: string;
  /** Utilisateur connecté ; `null` = anonyme ; `undefined` = ne pas toucher l’auth après reset */
  user?: User | null;
  /** `false` = sans SocketProvider ; `true` = mock par défaut ; objet = surcharge partielle */
  socket?: boolean | Partial<MockSocketContextValue>;
  /** Réinitialise le store avant le rendu (défaut `true`) */
  resetStore?: boolean;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    user,
    socket = false,
    resetStore: shouldReset = true,
    ...renderOptions
  }: RenderWithProvidersOptions = {}
) {
  if (shouldReset) {
    resetStore();
  }

  if (user === null) {
    // resetStore laisse déjà l’état anonyme
  } else if (user !== undefined) {
    seedAuthenticatedUser(user);
  }

  const socketValue =
    socket === false
      ? null
      : socket === true
        ? createMockSocketContextValue()
        : createMockSocketContextValue(socket);

  function Wrapper({ children }: { children: ReactNode }) {
    const routed = (
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        {children}
      </MemoryRouter>
    );

    if (!socketValue) {
      return routed;
    }

    return <SocketContext.Provider value={socketValue}>{routed}</SocketContext.Provider>;
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
