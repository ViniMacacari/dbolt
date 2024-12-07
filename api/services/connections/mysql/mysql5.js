import MySQLV1 from "../../../models/mysql/mysql5.js"

class SMySQLV1 {
    async testConnection(config) {
        const db = new MySQLV1()
        try {
            await db.connect(config)
            await db.disconnect()
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error to connect:', error)
            await db.disconnect()
            return { success: false, message: 'Failed to connect to MySQL', error: error.message }
        }
    }

    async connection(config) {
        const db = new MySQLV1()
        try {
            await db.connect(config)
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error to connect:', error)
            return { success: false, message: 'Failed to connect to MySQL', error: error.message }
        }
    }
}

export default new SMySQLV1()