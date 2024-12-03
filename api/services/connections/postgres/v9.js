import PgV1 from "../../../models/postgres/v9.js"

class SPgV1 {
    async testConnection(config) {
        const db = new PgV1()
        try {
            await db.connect(config)
            await db.disconnect()
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error to connect:', error)
            await db.disconnect()
            return { success: false, message: 'Failed to connect to PostgreSQL', error: error.message }
        }
    }

    async connection(config) {
        const db = new PgV1()
        try {
            await db.connect(config)
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error to connect:', error)
            return { success: false, message: 'Failed to connect to PostgreSQL', error: error.message }
        }
    }
}

export default new SPgV1()