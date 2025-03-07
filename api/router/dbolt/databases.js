import express from 'express'
import Databases from '../../services/dbolt/databases.js'

const router = express.Router()

router.get('/avaliable', async (req, res) => {
    try {
        const connections = await Databases.avaliablesConnections()
        res.status(200).json(connections)
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch available connections' })
    }
})


export default router