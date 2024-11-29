import express from 'express'
import CPostgresV1 from '../../controllers/postgres/v9.js'

const router = express.Router()

router.post('v9+/test-connection', (req, res) => CPostgresV1.testConnection(req, res))

export default router