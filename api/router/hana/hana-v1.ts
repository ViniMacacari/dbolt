import express from 'express';

import CHanaV1 from '../../controllers/hana/hana-v1.js';

const router = express.Router();

router.post('/global-version/test-connection', (req, res) => {
  void CHanaV1.testConnection(req, res);
});
router.post('/global-version/connect', (req, res) => {
  void CHanaV1.connection(req, res);
});
router.get('/global-version/list-databases-and-schemas', (req, res) => {
  void CHanaV1.listDatabasesAndSchemas(req, res);
});
router.get('/global-version/get-selected-schema', (req, res) => {
  void CHanaV1.getSelectedSchema(req, res);
});
router.post('/global-version/set-schema', (req, res) => {
  void CHanaV1.setSchema(req, res);
});
router.post('/global-version/query', (req, res) => {
  void CHanaV1.query(req, res);
});
router.get('/global-version/list-objects', (req, res) => {
  void CHanaV1.listDatabaseObjects(req, res);
});
router.get('/global-version/list-table-objects', (req, res) => {
  void CHanaV1.listTableObjects(req, res);
});
router.get('/global-version/table-columns/:tableName', (req, res) => {
  void CHanaV1.tableColumns(req, res);
});
router.get('/global-version/table-keys/:tableName', (req, res) => {
  void CHanaV1.tableKeys(req, res);
});
router.get('/global-version/table-indexes/:tableName', (req, res) => {
  void CHanaV1.tableIndexes(req, res);
});
router.get('/global-version/table-ddl/:tableName', (req, res) => {
  void CHanaV1.tableDDL(req, res);
});
router.get('/global-version/procedure-ddl/:procedureName', (req, res) => {
  void CHanaV1.procedureDDL(req, res);
});

export default router;
