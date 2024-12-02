import SPgV1 from "../../services/connections/postgres/v9.js"
import LSPg1 from "../../services/lists/postgres/v9.js"
import SSPgV1 from "../../services/schemas/postgres/v9.js"

class CPostgresV1 {
    async testConnection(req, res) {
        const config = req.body
        if (!config || !config.host || !config.port || !config.user || !config.password) {
            return res.status(400).json({ success: false, message: 'Invalid configuration' })
        }

        try {
            const result = await SPgV1.testConnection(config)
            if (result.success) {
                return res.status(200).json(result)
            } else {
                return res.status(500).json(result)
            }
        } catch (error) {
            console.error('Controller error:', error)
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async listDatabasesAndSchemas(req, res) {
        try {
            const lspg1 = new LSPg1()
            const result = await lspg1.listDatabasesAndSchemas()
            if (result.success) {
                return res.status(200).json(result)
            } else {
                return res.status(500).json(result)
            }
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async connection(req, res) {
        const config = req.body
        if (!config || !config.host || !config.port || !config.user || !config.password) {
            return res.status(400).json({ success: false, message: 'Invalid configuration' })
        }

        try {
            const result = await SPgV1.connection(req.body)

            if (result.success) {
                return res.status(200).json(result)
            } else {
                return res.status(500).json(result)
            }
        } catch (error) {
            console.error('Controller error:', error)
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async getSelectedSchema(req, res) {
        try {
            const result = await SSPgV1.getSelectedSchema()

            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }
}

export default new CPostgresV1()