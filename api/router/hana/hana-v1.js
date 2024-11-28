import express from 'express'
import CHanaV1 from '../../controllers/hana/hana-v1.js'

const router = express.Router()

router.post('/v1/test-connection', (req, res) => CHanaV1.testConnection(req, res))

export default router