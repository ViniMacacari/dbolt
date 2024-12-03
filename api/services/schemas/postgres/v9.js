import PgV1 from '../../../models/postgres/v9.js'

class SSPgV1 {
    constructor() {
        this.db = new PgV1()
    }

    async getSelectedSchema() {
        try {
            const result = await this.db.executeQuery('SELECT current_database() as "database", current_schema() as "schema"')

            return { success: true, database: result[0].database, schema: result[0].schema }
        } catch {
            throw new Error('Not connected to PostgreSQL')
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
                    SELECT schema_name 
                    FROM information_schema.schemata 
                    WHERE schema_name = $1
                `, [schemaName])

                if (schemaExistsInNewDb.length === 0) {
                    throw new Error(`Schema "${schemaName}" does not exist in the specified database "${databaseName}"`)
                }

                await this.db.executeQuery(`SET search_path TO ${schemaName}`)
                const currentSchema = await this.getSelectedSchema()
                return {
                    success: true,
                    message: `Connected to database "${databaseName}" and schema "${schemaName}" set successfully`,
                    currentSchema
                }
            } else {
                const schemaExists = await this.db.executeQuery(`
                    SELECT schema_name 
                    FROM information_schema.schemata 
                    WHERE schema_name = $1
                `, [schemaName])

                if (schemaExists.length === 0) {
                    throw new Error(`Schema "${schemaName}" does not exist in the current database`)
                }

                await this.db.executeQuery(`SET search_path TO ${schemaName}`)
                const currentSchema = await this.getSelectedSchema()
                return {
                    success: true,
                    message: `Schema "${schemaName}" set in the current database`,
                    currentSchema
                }
            }
        } catch (error) {
            throw new Error(`Failed to set schema and database: ${error.message}`)
        }
    }
}

export default new SSPgV1()