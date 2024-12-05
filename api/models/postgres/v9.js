import pkg from 'pg'
const { Client } = pkg

class PgV1 {
    constructor() {
        if (!PgV1.instance) {
            this.connection = null
            this.config = null
            PgV1.instance = this
        }
        return PgV1.instance
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
            this.connection = new Client({
                ...config,
                database: config.database || 'postgres'
            })
            await this.connection.connect()
            console.log('Connected to PostgreSQL successfully')
            return this.connection
        } catch (error) {
            console.error('Error connecting to PostgreSQL:', error)
            this.connection = null
            throw error
        }
    }

    async disconnect() {
        if (!this.connection) {
            console.warn('Not connected to PostgreSQL')
            return
        }

        try {
            await this.connection.end()
            console.log('Disconnected from PostgreSQL successfully')
        } catch (error) {
            console.error('Error disconnecting from PostgreSQL:', error)
            throw new error
        } finally {
            this.connection = null
        }
    }

    async executeQuery(query, params = []) {
        if (!this.connection) {
            throw new Error('Not connected to PostgreSQL.')
        }

        try {
            const result = await this.connection.query(query, params)
            return result.rows
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

export default PgV1