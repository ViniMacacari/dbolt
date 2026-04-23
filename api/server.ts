import cors from 'cors';
import express, { type Application } from 'express';
import type { Server } from 'node:http';

import databases from './router/dbolt/databases.js';
import connections from './router/dbolt/connections.js';
import query from './router/dbolt/query.js';
import hanaV1 from './router/hana/hana-v1.js';
import pgV9 from './router/postgres/v9.js';
import mysql5 from './router/mysql/mysql5.js';
import sqlserver2008 from './router/sqlserver/v2008.js';

const PORT = 47953;

class InternalServer {
  private readonly app: Application;

  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.app.use(cors());
  }

  loadServer(): Server {
    this.app.use('/api/databases', databases);
    this.app.use('/api/connections', connections);
    this.app.use('/api/query', query);
    this.app.use('/api/Hana', hanaV1);
    this.app.use('/api/Postgres/v9', pgV9);
    this.app.use('/api/MySQL/v5', mysql5);
    this.app.use('/api/SqlServer/2008', sqlserver2008);

    return this.app.listen(PORT, () => {
      console.log(`App listening on port ${PORT}`);
    });
  }
}

export default new InternalServer().loadServer();
