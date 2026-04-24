import express from 'express';

import CSQLServerV1 from '../../controllers/sqlserver/v2008.js';

const router = express.Router();

router.post('/test-connection', (req, res) => {
  void CSQLServerV1.testConnection(req, res);
});
router.post('/connect', (req, res) => {
  void CSQLServerV1.connection(req, res);
});
router.get('/list-databases-and-schemas', (req, res) => {
  void CSQLServerV1.listDatabasesAndSchemas(req, res);
});
router.get('/get-selected-schema', (req, res) => {
  void CSQLServerV1.getSelectedSchema(req, res);
});
router.post('/set-schema', (req, res) => {
  void CSQLServerV1.setDatabaseAndSchema(req, res);
});
router.post('/query', (req, res) => {
  void CSQLServerV1.query(req, res);
});
router.get('/list-objects', (req, res) => {
  void CSQLServerV1.listObjects(req, res);
});
router.get('/table-columns/:tableName', (req, res) => {
  void CSQLServerV1.tableColumns(req, res);
});
router.get('/table-keys/:tableName', (req, res) => {
  void CSQLServerV1.tableKeys(req, res);
});
router.get('/table-indexes/:tableName', (req, res) => {
  void CSQLServerV1.tableIndexes(req, res);
});
router.get('/table-ddl/:tableName', (req, res) => {
  void CSQLServerV1.tableDDL(req, res);
});

export default router;
