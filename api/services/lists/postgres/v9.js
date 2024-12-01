import PgV1 from '../../../models/postgres/v9.js'

class LSPg1 {
    constructor() {
        this.db = new PgV1()
    }

    async listDatabasesAndSchemas() {
        if (this.db.getStatus() !== 'connected') {
            return {
                success: false,
                message: 'No active connection. Ensure the database is connected before querying.'
            }
        }

        try {
            const databasesQuery = `
                SELECT datname AS database_name 
                FROM pg_database 
                WHERE datistemplate = false
            `
            const databases = await this.db.executeQuery(databasesQuery)

            const results = []
            for (const dbInfo of databases) {
                const { database_name } = dbInfo
                const schemaQuery = `
                    SELECT schema_name 
                    FROM information_schema.schemata 
                    WHERE catalog_name = $1
                `
                const schemas = await this.db.executeQuery(schemaQuery, [database_name])
                results.push({
                    database: database_name,
                    schemas: schemas.map(schema => schema.schema_name)
                })
            }

            return { success: true, data: results }
        } catch (error) {
            return {
                success: false,
                message: 'Error occurred while listing databases and schemas.',
                error: error.message
            }
        }
    }
}

export default new LSPg1()