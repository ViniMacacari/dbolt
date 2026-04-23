import express from 'express';

import CPostgresV1 from '../../controllers/postgres/v9.js';

const router = express.Router();

router.post('/test-connection', (req, res) => {
  void CPostgresV1.testConnection(req, res);
});
router.post('/connect', (req, res) => {
  void CPostgresV1.connection(req, res);
});
router.get('/list-databases-and-schemas', (req, res) => {
  void CPostgresV1.listDatabasesAndSchemas(req, res);
});
router.get('/get-selected-schema', (req, res) => {
  void CPostgresV1.getSelectedSchema(req, res);
});
router.post('/set-schema', (req, res) => {
  void CPostgresV1.setDatabaseAndSchema(req, res);
});
router.post('/query', (req, res) => {
  void CPostgresV1.query(req, res);
});
router.get('/list-objects', (req, res) => {
  void CPostgresV1.listDatabaseObjects(req, res);
});
router.get('/table-columns/:tableName', (req, res) => {
  void CPostgresV1.tableColumns(req, res);
});

export default router;
