import pkg from 'pg'
const { Client } = pkg

class PgV1 {
    constructor(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid configuration')
        }
        this.config = {
            ...config,
            database: config.database || 'postgres'
        }

        this.connection = null
    }

    async connect() {
        if (this.connection) {
            console.warn('Already connected to PostgreSQL')
            return this.connection
        }

        try {
            this.connection = new Client(this.config)
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
            throw error
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
            throw error
        }
    }
}

export default PgV1