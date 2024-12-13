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

        const results = []
        let successfulConnections = 0
        let totalConnections = 0

        try {
            if (!this.mainConfig) {
                const config = this.db.getConfig()
                this.mainConfig = {
                    user: config.user,
                    password: config.password,
                    server: config.server || config.host,
                    options: {
                        port: parseInt(config.options?.port || 1433),
                        encrypt: config.options?.encrypt || false,
                        trustServerCertificate: config.options?.trustServerCertificate || true
                    }
                }
            }

            const databasesQuery = `
                SELECT name AS database_name
                FROM sys.databases
                WHERE name NOT IN ('tempdb', 'model', 'msdb')
                ORDER BY name
            `
            const databases = await this.db.executeQuery(databasesQuery)

            for (const dbInfo of databases) {
                const { database_name } = dbInfo
                totalConnections++

                try {
                    await this.db.disconnect()
                    await this.db.connect({
                        ...this.mainConfig,
                        database: database_name
                    })

                    const schemaQuery = `
                    SELECT name AS schema_name
                    FROM sys.schemas
                    WHERE name NOT IN (
                        'sys', 
                        'guest', 
                        'INFORMATION_SCHEMA', 
                        'db_accessadmin',
                        'db_backupoperator',
                        'db_datareader',
                        'db_datawriter',
                        'db_ddladmin',
                        'db_denydatareader',
                        'db_denydatawriter',
                        'db_owner',
                        'db_securityadmin'
                    )
                    ORDER BY name
                    `
                    const schemas = await this.db.executeQuery(schemaQuery)

                    results.push({
                        database: database_name,
                        schemas: schemas.map(schema => schema.schema_name)
                    })

                    successfulConnections++
                } catch (error) {
                    console.warn(`Failed to connect or query database: ${database_name}`, error.message)
                }
            }

            if (successfulConnections === 0) {
                return {
                    success: false,
                    message: `No databases could be accessed successfully. Tried ${totalConnections} databases.`
                }
            }

            return { success: true, data: results }
        } catch (error) {
            console.error('Error in listDatabasesAndSchemas:', error)
            return {
                success: false,
                message: 'An error occurred while listing databases and schemas.',
                error: error.message
            }
        } finally {
            if (this.mainConfig) {
                try {
                    await this.db.disconnect()
                    await this.db.connect({ ...this.mainConfig })
                } catch (finalError) {
                    console.error('Failed to reconnect to the main database:', finalError.message)
                }
            }
        }
    }
}

export default LSSQLServer1