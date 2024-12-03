import SHanaV1 from "../../services/connections/hana/hana-v1.js"
import LSHanaV1 from "../../services/lists/hana/hana-v1.js"
import SSchemaHanaV1 from "../../services/schemas/hana/hana-v1.js"

class CHanaV1 {
    async testConnection(req, res) {
        const config = req.body
        if (!config || !config.host || !config.port || !config.user || !config.password) {
            return res.status(400).json({ success: false, message: 'Invalid configuration' })
        }

        try {
            const result = await SHanaV1.testConnection(config)
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

    async connection(req, res) {
        const config = req.body
        if (!config || !config.host || !config.port || !config.user || !config.password) {
            return res.status(400).json({ success: false, message: 'Invalid configuration' })
        }

        try {
            const result = await SHanaV1.connection(config)
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
            const lspg1 = new LSHanaV1()
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

    async getSelectedSchema(req, res) {
        try {
            const result = await SSchemaHanaV1.getSelectedSchema()

            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async setSchema(req, res) {
        try {
            const result = await SSchemaHanaV1.setSchema(req.body.schema)

            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }
}

export default new CHanaV1()