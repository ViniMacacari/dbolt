import SQLServerV1 from '../../../models/sqlserver/v2008.js'

class LSSQLServer1 {
    constructor() {
        this.db = new SQLServerV1()
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
                const config = this.db.getConfig()
                this.mainConfig = {
                    user: config.user,
                    password: config.password,
                    server: config.server,
                    options: {
                        port: config.options.port || 1433,
                        encrypt: config.options.encrypt || false,
                        trustServerCertificate: config.options.trustServerCertificate || true
                    }
                }
            }

            const currentDatabase = this.mainConfig.database

            const databasesQuery = `
                SELECT name AS database_name
                FROM sys.databases
                WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
                ORDER BY name
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
                    SELECT name AS schema_name
                    FROM sys.schemas
                    WHERE name NOT LIKE 'db_%' AND name NOT LIKE 'guest'
                    ORDER BY name
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

export default LSSQLServer1