import SSQLServerV1 from "../../services/connections/sqlserver/v2008.js"
import LSSQLServer1 from "../../services/lists/sqlserver/v2008.js"
import SSSQLServerV1 from "../../services/schemas/sqlserver/v2008.js"
import SQuerySQLServerV1 from "../../services/queries/sqlserver/v2008.js"
import ListObjectsSQLServerV1 from '../../services/database-info/sqlserver/v2008.js'

class CSQLServerV1 {
    async testConnection(req, res) {
        const config = req.body
        if (!config || !config.host || !config.port || !config.user || !config.password) {
            return res.status(400).json({ success: false, message: 'Invalid configuration' })
        }

        try {
            const result = await SSQLServerV1.testConnection(config)
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
            const lssql1 = new LSSQLServer1()
            const result = await lssql1.listDatabasesAndSchemas()
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
            const result = await SSQLServerV1.connection(req.body)

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
            const result = await SSSQLServerV1.getSelectedSchema()

            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async setDatabaseAndSchema(req, res) {
        try {
            const result = await SSSQLServerV1.setDatabaseAndSchema(req.body.schema, req.body.database)

            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async query(req, res) {
        try {
            const result = await SQuerySQLServerV1.query(req.body.sql, req.body.maxLines)

            return res.status(200).json(result)
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async listObjects(req, res) {
        try {
            const result = await ListObjectsSQLServerV1.listDatabaseObjects()
            if (result.success) {
                return res.status(200).json(result)
            } else {
                return res.status(500).json(result)
            }
        } catch (error) {
            console.error('Error in listObjects controller:', error)
            return res.status(500).json({ success: false, message: 'Server error', error: error.message })
        }
    }

    async tableColumns(req, res) {
        try {
            const tableName = req.params.tableName
            const result = await ListObjectsSQLServerV1.tableColumns(tableName)
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

export default new CSQLServerV1()