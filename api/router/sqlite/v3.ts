import express from 'express';

import CSQLiteV3 from '../../controllers/sqlite/v3.js';

const router = express.Router();

router.post('/test-connection', (req, res) => {
  void CSQLiteV3.testConnection(req, res);
});
router.post('/connect', (req, res) => {
  void CSQLiteV3.connection(req, res);
});
router.get('/list-databases-and-schemas', (req, res) => {
  void CSQLiteV3.listDatabases(req, res);
});
router.get('/get-selected-schema', (req, res) => {
  void CSQLiteV3.getSelectedDatabase(req, res);
});
router.post('/set-schema', (req, res) => {
  void CSQLiteV3.setDatabase(req, res);
});
router.post('/query', (req, res) => {
  void CSQLiteV3.query(req, res);
});
router.get('/list-objects', (req, res) => {
  void CSQLiteV3.listDatabaseObjects(req, res);
});
router.get('/list-table-objects', (req, res) => {
  void CSQLiteV3.listTableObjects(req, res);
});
router.get('/table-columns/:tableName', (req, res) => {
  void CSQLiteV3.tableColumns(req, res);
});
router.get('/table-keys/:tableName', (req, res) => {
  void CSQLiteV3.tableKeys(req, res);
});
router.get('/table-indexes/:tableName', (req, res) => {
  void CSQLiteV3.tableIndexes(req, res);
});
router.get('/table-ddl/:tableName', (req, res) => {
  void CSQLiteV3.tableDDL(req, res);
});
router.get('/procedure-ddl/:procedureName', (req, res) => {
  void CSQLiteV3.procedureDDL(req, res);
});

export default router;
