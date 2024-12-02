import express from 'express'
import CHanaV1 from '../../controllers/hana/hana-v1.js'

const router = express.Router()

router.post('/global-version/test-connection', (req, res) => CHanaV1.testConnection(req, res))
router.post('/global-version/connect', (req, res) => CHanaV1.connection(req, res))
router.get('/global-version/list-databases-and-schemas', (req, res) => CHanaV1.listDatabasesAndSchemas(req, res))
router.get('/global-version/get-selected-schema', (req, res) => CHanaV1.getSelectedSchema(req, res))

export default router