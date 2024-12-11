import SQLServerV1 from "../../../models/sqlserver/v2008.js"

class SSQLServerV1 {
    async testConnection(config) {
        const db = new SQLServerV1()
        try {
            await db.connect(config)
            await db.disconnect()
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error connecting to SQL Server:', error)
            await db.disconnect()
            return { success: false, message: 'Failed to connect to SQL Server', error: error.message }
        }
    }

    async connection(config) {
        const db = new SQLServerV1()
        try {
            await db.connect(config)
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error connecting to SQL Server:', error)
            return { success: false, message: 'Failed to connect to SQL Server', error: error.message }
        }
    }
}

export default new SSQLServerV1()