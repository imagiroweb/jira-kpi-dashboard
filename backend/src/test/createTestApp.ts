import express, { Express, Router } from 'express';
import type { Server } from 'socket.io';

export interface CreateTestAppOptions {
  mountPath: string;
  router: Router;
  /** Active express.json() — défaut true */
  json?: boolean;
  /** Mock Socket.io injecté via app.set('io', io) */
  io?: Partial<Server> | null;
}

/** Factory Express pour tests de routes : json(), montage du router, io optionnel */
export function createTestApp(options: CreateTestAppOptions): Express {
  const { mountPath, router, json = true, io } = options;
  const app = express();
  if (json) {
    app.use(express.json());
  }
  if (io !== undefined) {
    app.set('io', io);
  }
  app.use(mountPath, router);
  return app;
}
