import sql from 'mssql'

class SQLServerV1 {
    constructor() {
        if (!SQLServerV1.instance) {
            this.pool = null
            this.config = null
            SQLServerV1.instance = this
        }
        return SQLServerV1.instance
    }

    async connect(config) {
        if (this.pool) {
            await this.disconnect()
        }

        if (!config || typeof config !== 'object') {
            throw new Error('Invalid configuration')
        }

        try {
            this.config = { ...config }
            this.pool = await sql.connect({
                server: config.host,
                ...config,
                options: {
                    encrypt: false,
                    trustServerCertificate: true,
                    port: parseInt(config.port, 10),
                    ...(config.options || {})
                }
            })

            console.log('Connected to SQL Server successfully')
            return this.pool
        } catch (error) {
            console.error('Error connecting to SQL Server:', error)
            this.pool = null
            throw error
        }
    }

    async disconnect() {
        if (!this.pool) {
            console.warn('Not connected to SQL Server')
            return
        }

        try {
            await this.pool.close()
            console.log('Disconnected from SQL Server successfully')
        } catch (error) {
            console.error('Error disconnecting from SQL Server:', error)
            throw error
        } finally {
            this.pool = null
        }
    }

    async executeQuery(query, params = []) {
        if (!this.pool) {
            throw new Error('Not connected to SQL Server.')
        }

        try {
            const request = this.pool.request()

            params.forEach(param => {
                request.input(param.name, param.type, param.value)
            })

            const result = await request.query(query)
            return result.recordset
        } catch (error) {
            console.error('Error executing query:', error)
            throw error
        }
    }

    getStatus() {
        return this.pool ? 'connected' : 'disconnected'
    }

    getConfig() {
        if (!this.config) {
            throw new Error('No configuration available')
        }
        return this.config
    }
}

export default SQLServerV1