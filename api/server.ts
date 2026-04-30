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
import { INTERNAL_API_TOKEN_HEADER } from './services/security/internal-session-token.js';

const PORT = 47953;
const HOST = '127.0.0.1';
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

    return this.app.listen(PORT, HOST, () => {
      console.log(`App listening on http://${HOST}:${PORT}`);
    });
  }
}

export default new InternalServer().loadServer();
