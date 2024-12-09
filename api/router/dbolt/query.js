import express from 'express'

import LoadQueries from '../../services/dbolt/load-query.js'
import SaveQuery from '../../services/dbolt/save-query.js'

const router = express.Router()

router.post('/new', async (req, res) => {
    try {
        const queryData = req.body

        if (!queryData || Object.keys(queryData).length === 0) {
            return res.status(400).json({ error: 'No query data provided' })
        }

        await SaveQuery.newQuery(queryData)
        res.status(200).json({ success: true, message: 'Query saved successfully' })
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to save query', error: error.message })
    }
})

router.get('/load', async (req, res) => {
    try {
        const queries = await LoadQueries.getAllQueries()
        res.status(200).json(queries)
    } catch (error) {
        console.error('Error loading queries:', error)
        res.status(500).json({ success: false, message: 'Failed to load queries', error: error.message })
    }
})

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params
        const query = await LoadQueries.getQueryById(parseInt(id, 10))

        if (!query) {
            return res.status(404).json({ success: false, message: `Query with ID ${id} not found` })
        }

        res.status(200).json(query)
    } catch (error) {
        console.error(`Error loading query with ID ${req.params.id}:`, error)
        res.status(500).json({ success: false, message: 'Failed to load query', error: error.message })
    }
})

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params
        const success = await LoadQueries.deleteQueryById(parseInt(id, 10))

        if (!success) {
            return res.status(404).json({ success: false, message: `Query with ID ${id} not found` })
        }

        res.status(200).json({ success: true, message: `Query with ID ${id} deleted successfully` })
    } catch (error) {
        console.error(`Error deleting query with ID ${req.params.id}:`, error)
        res.status(500).json({ success: false, message: 'Failed to delete query', error: error.message })
    }
})

export default router