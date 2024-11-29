import express from 'express'

import LoadConnections from '../../services/dbolt/load-connection.js'
import SaveConnection from '../../services/dbolt/save-connection.js'

const router = express.Router()

router.post('/new', async (req, res) => {
    try {
        const connectionData = req.body

        if (!connectionData || Object.keys(connectionData).length === 0) {
            return res.status(400).json({ error: 'No connection data provided' })
        }

        await SaveConnection.newConnection(connectionData)
        res.status(200).json({ success: true, message: 'Connection saved successfully' })
    } catch (error) {
        res.status(500).json({ sucess: false, message: 'Failed to save connection', error: error.message })
    }
})

router.get('/load', async (req, res) => {
    try {
        const connections = await LoadConnections.getAllConnections()
        res.status(200).json(connections)
    } catch (error) {
        console.error('Error loading connections:', error)
        res.status(500).json({ sucess: false, message: 'Failed to load connection', error: error.message })
    }
})

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params
        const connection = await LoadConnections.getConnectionById(parseInt(id, 10))

        if (!connection) {
            return res.status(404).json({ success: false, message: `Connection with ID ${id} not found` })
        }

        res.status(200).json(connection)
    } catch (error) {
        console.error(`Error loading connection with ID ${req.params.id}:`, error)
        res.status(500).json({ success: false, message: 'Failed to load connection', error: error.message })
    }
})

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params
        const success = await LoadConnections.deleteConnectionById(parseInt(id, 10))

        if (!success) {
            return res.status(404).json({ success: false, message: `Connection with ID ${id} not found` })
        }

        res.status(200).json({ success: true, message: `Connection with ID ${id} deleted successfully` })
    } catch (error) {
        console.error(`Error deleting connection with ID ${req.params.id}:`, error)
        res.status(500).json({ success: false, message: 'Failed to delete connection', error: error.message })
    }
})

export default router