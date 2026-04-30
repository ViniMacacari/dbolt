import cors from 'cors';
import express, { type Application } from 'express';
import type { Server } from 'node:http';

import { requireInternalSessionToken } from './middleware/internal-session-auth.js';
import appInfo from './router/dbolt/app-info.js';
import databases from './router/dbolt/databases.js';
import connections from './router/dbolt/connections.js';
import query from './router/dbolt/query.js';
import hanaV1 from './router/hana/hana-v1.js';
import pgV9 from './router/postgres/v9.js';
import mysql5 from './router/mysql/mysql5.js';
import sqlserver2008 from './router/sqlserver/v2008.js';
import {
  INTERNAL_API_TOKEN_HEADER,
  getInternalApiSessionToken
} from './services/security/internal-session-token.js';

const BROWSER_DEV_MODE = process.env['DBOLT_BROWSER_DEV'] === '1';
const PORT = BROWSER_DEV_MODE ? 47953 : 0;
export const INTERNAL_API_HOST = '127.0.0.1';
const ALLOWED_ORIGINS = new Set([
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'null'
]);

class InternalServer {
  private readonly app: Application;

  constructor() {
    this.app = express();
    this.app.use(cors({
      allowedHeaders: ['Content-Type', INTERNAL_API_TOKEN_HEADER],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      origin: (origin, callback) => {
        callback(null, !origin || ALLOWED_ORIGINS.has(origin));
      }
    }));
    this.loadBrowserDevSessionRoute();
    this.app.use(requireInternalSessionToken);
    this.app.use(express.json());
  }

  loadServer(): Server {
    this.app.use('/api/app-info', appInfo);
    this.app.use('/api/databases', databases);
    this.app.use('/api/connections', connections);
    this.app.use('/api/query', query);
    this.app.use('/api/Hana', hanaV1);
    this.app.use('/api/Postgres/v9', pgV9);
    this.app.use('/api/MySQL/v5', mysql5);
    this.app.use('/api/SqlServer/2008', sqlserver2008);

    const server = this.app.listen(PORT, INTERNAL_API_HOST, () => {
      console.log(`App listening on ${getInternalApiBaseUrl(server)}`);
    });

    return server;
  }

  private loadBrowserDevSessionRoute(): void {
    if (!BROWSER_DEV_MODE) {
      return;
    }

    this.app.get('/api/internal-session', (req, res) => {
      const origin = req.get('origin');

      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        res.status(403).json({
          success: false,
          message: 'Browser dev session is only available from local dev origins.'
        });
        return;
      }

      res.json({
        success: true,
        baseUrl: getInternalApiBaseUrl(),
        token: getInternalApiSessionToken(),
        tokenHeader: INTERNAL_API_TOKEN_HEADER
      });
    });
  }
}

const internalServer = new InternalServer().loadServer();

export const internalApiReady = new Promise<void>((resolve, reject) => {
  if (internalServer.listening) {
    resolve();
    return;
  }

  internalServer.once('listening', () => resolve());
  internalServer.once('error', reject);
});

export function getInternalApiBaseUrl(server: Server = internalServer): string {
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Internal API server is not listening.');
  }

  return `http://${INTERNAL_API_HOST}:${address.port}`;
}

export default internalServer;
