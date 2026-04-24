import express from 'express';

import CMySQLV1 from '../../controllers/mysql/mysql5.js';

const router = express.Router();

router.post('/test-connection', (req, res) => {
  void CMySQLV1.testConnection(req, res);
});
router.post('/connect', (req, res) => {
  void CMySQLV1.connection(req, res);
});
router.get('/list-databases-and-schemas', (req, res) => {
  void CMySQLV1.listDatabases(req, res);
});
router.get('/get-selected-schema', (req, res) => {
  void CMySQLV1.getSelectedDatabase(req, res);
});
router.post('/set-schema', (req, res) => {
  void CMySQLV1.setDatabase(req, res);
});
router.post('/query', (req, res) => {
  void CMySQLV1.query(req, res);
});
router.get('/list-objects', (req, res) => {
  void CMySQLV1.listDatabaseObjects(req, res);
});
router.get('/table-columns/:tableName', (req, res) => {
  void CMySQLV1.tableColumns(req, res);
});
router.get('/table-keys/:tableName', (req, res) => {
  void CMySQLV1.tableKeys(req, res);
});
router.get('/table-indexes/:tableName', (req, res) => {
  void CMySQLV1.tableIndexes(req, res);
});
router.get('/table-ddl/:tableName', (req, res) => {
  void CMySQLV1.tableDDL(req, res);
});

export default router;
