import express from 'express'
import Databases from '../../services/databases/databases.js'

const router = express.Router()

router.get('/avaliables', async (req, res) => {
    try {
        const connections = await Databases.avaliablesConnections()
        res.status(200).json(connections)
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch available connections' })
    }
})


export default router