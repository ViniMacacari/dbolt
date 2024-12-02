import HanaV1 from "../../../models/hana/hana-v1.js"

class SHanaV1 {
    async testConnection(config) {
        const db = new HanaV1()
        try {
            await db.connect(config)
            await db.disconnect()
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error to connect:', error)
            return { success: false, message: 'Failed to connect to Hana', error: error.message }
        }
    }

    async connection(config) {
        const db = new HanaV1()
        try {
            await db.connect(config)
            return { success: true, message: 'Connection successfully established!' }
        } catch (error) {
            console.error('Error to connect:', error)
            return { success: false, message: 'Failed to connect to Hana', error: error.message }
        }
    }
}

export default new SHanaV1()