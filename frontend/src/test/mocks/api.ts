import { vi, type Mock } from 'vitest';

export interface AxiosMocks {
  mockGet: Mock;
  mockPost: Mock;
  mockPatch: Mock;
  mockDelete: Mock;
  mockPut: Mock;
}

export function createApiMock(mocks: AxiosMocks) {
  return {
    get: mocks.mockGet,
    post: mocks.mockPost,
    patch: mocks.mockPatch,
    delete: mocks.mockDelete,
    put: mocks.mockPut,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
}

/** Factory pour `vi.mock('axios', () => axiosModuleMock(axiosMocks))` */
export function axiosModuleMock(mocks: AxiosMocks) {
  return {
    default: {
      create: () => createApiMock(mocks),
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
