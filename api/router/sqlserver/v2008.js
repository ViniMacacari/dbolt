import express from 'express'
import CSQLServerV1 from '../../controllers/sqlserver/v2008.js'

const router = express.Router()

router.post('/test-connection', (req, res) => CSQLServerV1.testConnection(req, res))
router.post('/connect', (req, res) => CSQLServerV1.connection(req, res))
router.get('/list-databases-and-schemas', (req, res) => CSQLServerV1.listDatabasesAndSchemas(req, res))
router.get('/get-selected-schema', (req, res) => CSQLServerV1.getSelectedSchema(req, res))
router.post('/set-schema', (req, res) => CSQLServerV1.setDatabaseAndSchema(req, res))
router.post('/query', (req, res) => CSQLServerV1.query(req, res))
router.get('/list-objects', (req, res) => CSQLServerV1.listObjects(req, res))

export default router