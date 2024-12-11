import SQLServerV1 from '../../../models/sqlserver/v2008.js'

class SSSQLServerV1 {
    constructor() {
        this.db = new SQLServerV1()
    }

    async getSelectedSchema() {
        try {
            const result = await this.db.executeQuery(`
                SELECT 
                    DB_NAME() AS database,
                    SCHEMA_NAME() AS schema
            `)

            return { success: true, database: result[0].database, schema: result[0].schema }
        } catch {
            throw new Error('Not connected to SQL Server')
        }
    }

    async setDatabaseAndSchema(schemaName, databaseName) {
        try {
            if (!schemaName && !databaseName) {
                throw new Error('Either schema name or database name is required')
            }

            if (databaseName) {
                await this.db.disconnect()
                await this.db.connect({ ...this.db.getConfig(), database: databaseName })

                if (!schemaName) {
                    const currentSchema = await this.getSelectedSchema()
                    return {
                        success: true,
                        message: `Connected to database "${databaseName}" without setting a schema`,
                        currentSchema
                    }
                }

                const schemaExistsInNewDb = await this.db.executeQuery(`
                    SELECT name AS schema_name
                    FROM sys.schemas
                    WHERE name = @schemaName
                `, [{ name: 'schemaName', type: 'nvarchar', value: schemaName }])

                if (schemaExistsInNewDb.length === 0) {
                    throw new Error(`Schema "${schemaName}" does not exist in the specified database "${databaseName}"`)
                }

                const currentSchema = await this.getSelectedSchema()
                return {
                    success: true,
                    message: `Connected to database "${databaseName}" and schema "${schemaName}" verified successfully`,
                    currentSchema
                }
            } else {
                const schemaExists = await this.db.executeQuery(`
                    SELECT name AS schema_name
                    FROM sys.schemas
                    WHERE name = @schemaName
                `, [{ name: 'schemaName', type: 'nvarchar', value: schemaName }])

                if (schemaExists.length === 0) {
                    throw new Error(`Schema "${schemaName}" does not exist in the current database`)
                }

                const currentSchema = await this.getSelectedSchema()
                return {
                    success: true,
                    message: `Schema "${schemaName}" verified in the current database`,
                    currentSchema
                }
            }
        } catch (error) {
            throw new Error(`Failed to set schema and database: ${error.message}`)
        }
    }
}

export default new SSSQLServerV1()