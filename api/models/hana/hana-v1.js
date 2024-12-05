import hana from '@sap/hana-client'

class HanaV1 {
    constructor() {
        if (!HanaV1.instance) {
            this.connection = null
            this.config = null
            HanaV1.instance = this
        }
        return HanaV1.instance
    }

    async connect(config) {
        if (this.connection) {
            await this.disconnect()
        }

        if (!config || typeof config !== 'object') {
            throw new Error('Invalid configuration')
        }

        try {
            this.config = config
            this.connection = hana.createConnection()
            await this.connection.connect(config)
            console.log('Connected to HANA successfully')
            return this.connection
        } catch (error) {
            console.error('Error connecting to HANA:', error)
            this.connection = null
            throw error
        }
    }

    async disconnect() {
        if (!this.connection) {
            console.warn('Not connected to HANA')
            return
        }

        try {
            this.connection.disconnect()
            console.log('Disconnected from HANA successfully')
        } catch (error) {
            console.error('Error disconnecting from HANA:', error)
            throw error
        } finally {
            this.connection = null
            this.config = null
        }
    }

    async executeQuery(query, params = []) {
        if (!this.connection) {
            throw new Error('Not connected to HANA.')
        }

        try {
            return await new Promise((resolve, reject) => {
                const statement = this.connection.prepare(query)
                statement.exec(params, (err, results) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(results)
                    }
                })
            })
        } catch (error) {
            console.error('Error executing query:', error)
            throw error
        }
    }

    getStatus() {
        return this.connection ? 'connected' : 'disconnected'
    }
}

export default HanaV1