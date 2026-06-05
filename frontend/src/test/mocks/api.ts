import { vi, type Mock } from 'vitest';

export interface AxiosMocks {
  mockGet: Mock;
  mockPost: Mock;
  mockPatch: Mock;
  mockDelete: Mock;
  mockPut: Mock;
}

/** Handlers enregistrés par `api.ts` au chargement du module (tests intercepteurs). */
export interface AxiosInterceptorCapture {
  requestOnFulfilled: ((config: { headers: Record<string, string> }) => { headers: Record<string, string> }) | null;
  responseOnRejected: ((error: unknown) => unknown) | null;
}

export function createApiMock(mocks: AxiosMocks, capture?: AxiosInterceptorCapture) {
  return {
    get: mocks.mockGet,
    post: mocks.mockPost,
    patch: mocks.mockPatch,
    delete: mocks.mockDelete,
    put: mocks.mockPut,
    interceptors: {
      request: {
        use: vi.fn((onFulfilled: (config: { headers: Record<string, string> }) => { headers: Record<string, string> }) => {
          if (capture) capture.requestOnFulfilled = onFulfilled;
        }),
      },
      response: {
        use: vi.fn(
          (
            _onFulfilled: unknown,
            onRejected: (error: unknown) => unknown
          ) => {
            if (capture) capture.responseOnRejected = onRejected;
          }
        ),
      },
    },
  };
}

/** Factory pour `vi.mock('axios', () => axiosModuleMock(axiosMocks))` */
export function axiosModuleMock(mocks: AxiosMocks, capture?: AxiosInterceptorCapture) {
  return {
    default: {
      create: () => createApiMock(mocks, capture),
    },
  };
}

export function clearAxiosMocks(mocks: AxiosMocks) {
  mocks.mockGet.mockReset();
  mocks.mockPost.mockReset();
  mocks.mockPatch.mockReset();
  mocks.mockDelete.mockReset();
  mocks.mockPut.mockReset();
}
