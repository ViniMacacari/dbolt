import SMySQLV1 from "../../services/connections/mysql/mysql5.js"
import LSMySQL1 from "../../services/lists/mysql/mysql5.js"
import SSMySQLV1 from "../../services/schemas/mysql/mysql5.js"
import SQueryMySQLV1 from "../../services/queries/mysql/mysql5.js"
import ListObjectsMySQLV1 from "../../services/database-info/mysql/mysql5.js"

class CMySQLV1 {
    async testConnection(req, res) {
        const config = req.body
        if (!config || !config.host || !config.user || !config.password) {
            return res.status(400).json({ success: false, message: 'Invalid configuration' })
        }

        try {
            const result = await SMySQLV1.testConnection(config)
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

    async listDatabases(req, res) {
        try {
            const lsMySQL1 = new LSMySQL1()
            const result = await lsMySQL1.listDatabasesAndSchemas()
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
        if (!config || !config.host || !config.user || !config.password) {
            return res.status(400).json({ success: false, message: 'Invalid configuration' })
        }

        try {
            const result = await SMySQLV1.connection(req.body)

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

    async getSelectedDatabase(req, res) {
        try {
            const result = await SSMySQLV1.getSelectedDatabase()
            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async setDatabase(req, res) {
        try {
            const result = await SSMySQLV1.setDatabase(req.body.database)
            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async query(req, res) {
        try {
            const result = await SQueryMySQLV1.query(req.body.sql, req.body.maxLines)
            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async listDatabaseObjects(req, res) {
        try {
            const result = await ListObjectsMySQLV1.listDatabaseObjects()

            if (result.success) {
                return res.status(200).json(result)
            } else {
                return res.status(500).json(result)
            }
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }
}

export default new CMySQLV1()