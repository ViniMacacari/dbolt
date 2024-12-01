import express from 'express'
import CPostgresV1 from '../../controllers/postgres/v9.js'
import LCPg1 from '../../services/lists/postgres/v9.js'

const router = express.Router()

router.post('/test-connection', (req, res) => CPostgresV1.testConnection(req, res))
router.post('/connect', (req, res) => CPostgresV1.connection(req, res))
router.get('/list-databases-and-schemas', (req, res) => LCPg1.listDatabasesAndSchemas(req, res))

export default router