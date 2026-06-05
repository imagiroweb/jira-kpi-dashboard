/** Mock mongoose avec connexion MongoDB établie (readyState: 1) */
export function mockMongoConnected() {
  const actual = jest.requireActual<typeof import('mongoose')>('mongoose');
  return {
    ...actual,
    connection: { readyState: 1 },
  };
}

/** Mock mongoose sans connexion (readyState: 0) */
export function mockMongoDisconnected() {
  const actual = jest.requireActual<typeof import('mongoose')>('mongoose');
  return {
    ...actual,
    connection: { readyState: 0 },
  };
}
