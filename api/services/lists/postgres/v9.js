import PgV1 from '../../../models/postgres/v9.js'

class LSPg1 {
    constructor() {
        this.db = new PgV1()
        this.mainConfig = null
    }

    async listDatabasesAndSchemas() {
        if (this.db.getStatus() !== 'connected') {
            return {
                success: false,
                message: 'No active connection. Ensure the database is connected before querying.'
            }
        }

        try {
            if (!this.mainConfig) {
                this.mainConfig = {
                    host: this.db.connection.host,
                    port: this.db.connection.port,
                    user: this.db.connection.user,
                    password: this.db.connection.password,
                    database: this.db.connection.database
                }
            }

            const currentDatabase = this.mainConfig.database

            const databasesQuery = `
                SELECT datname AS database_name 
                FROM pg_database 
                WHERE datistemplate = false
                ORDER BY 1
            `
            const databases = await this.db.executeQuery(databasesQuery)

            const results = []

            for (const dbInfo of databases) {
                const { database_name } = dbInfo

                await this.db.disconnect()
                await this.db.connect({
                    ...this.mainConfig,
                    database: database_name
                })

                const schemaQuery = `
                    SELECT schema_name 
                    FROM information_schema.schemata
                    WHERE schema_name NOT LIKE 'pg_%' AND schema_name NOT LIKE 'information_schema'
                    ORDER BY 1
                `
                const schemas = await this.db.executeQuery(schemaQuery)

                results.push({
                    database: database_name,
                    schemas: schemas.map(schema => schema.schema_name)
                })
            }

            await this.db.disconnect()
            await this.db.connect({ ...this.mainConfig, database: currentDatabase })

            return { success: true, data: results }
        } catch (error) {
            console.error('Error in listDatabasesAndSchemas:', error)
            return {
                success: false,
                message: 'Error occurred while listing databases and schemas.',
                error: error.message
            }
        }
    }
}

export default LSPg1