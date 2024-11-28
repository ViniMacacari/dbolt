import express from 'express'
import CHanaV1 from '../../controllers/hana/hana-v1.js'

const router = express.Router()

router.post('/v1/connect', (req, res) => CHanaV1.connectToHana(req, res))

export default router