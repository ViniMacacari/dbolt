import mysql from 'mysql2/promise'

class MySQLV1 {
    constructor() {
        if (!MySQLV1.instance) {
            this.connection = null
            this.config = null
            MySQLV1.instance = this
        }
        return MySQLV1.instance
    }

    async connect(config) {
        if (this.connection) {
            await this.disconnect()
        }

        if (!config || typeof config !== 'object') {
            throw new Error('Invalid configuration')
        }

        try {
            this.config = { ...config }
            this.connection = await mysql.createConnection({
                ...config
            })
            console.log('Connected to MySQL successfully')
            return this.connection
        } catch (error) {
            console.error('Error connecting to MySQL:', error)
            this.connection = null
            throw error
        }
    }

    async disconnect() {
        if (!this.connection) {
            console.warn('Not connected to MySQL')
            return
        }

        try {
            await this.connection.end()
            console.log('Disconnected from MySQL successfully')
        } catch (error) {
            console.error('Error disconnecting from MySQL:', error)
            throw new error
        } finally {
            this.connection = null
        }
    }

    async executeQuery(query, params = []) {
        if (!this.connection) {
            throw new Error('Not connected to MySQL.')
        }

        try {
            const [rows] = await this.connection.execute(query, params)
            return rows
        } catch (error) {
            console.error('Error executing query:', error)
            throw new error
        }
    }

    getStatus() {
        return this.connection ? 'connected' : 'disconnected'
    }

    getConfig() {
        if (!this.config) {
            throw new Error('No configuration available')
        }
        return this.config
    }
}

export default MySQLV1