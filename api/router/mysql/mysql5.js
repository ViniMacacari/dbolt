import express from 'express'
import CMySQLV1 from '../../controllers/mysql/mysql5.js'

const router = express.Router()

router.post('/test-connection', (req, res) => CMySQLV1.testConnection(req, res))
router.post('/connect', (req, res) => CMySQLV1.connection(req, res))
router.get('/list-databases-and-schemas', (req, res) => CMySQLV1.listDatabases(req, res))
router.get('/get-selected-schema', (req, res) => CMySQLV1.getSelectedDatabase(req, res))
router.post('/set-schema', (req, res) => CMySQLV1.setDatabase(req, res))
router.post('/query', (req, res) => CMySQLV1.query(req, res))
router.get('/list-objects', (req, res) => CMySQLV1.listDatabaseObjects(req, res))
router.get('/table-columns/:tableName', (req, res) => CMySQLV1.tableColumns(req, res))

export default router