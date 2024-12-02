import HanaV1 from '../../../models/hana/hana-v1.js'

class LSHanaV1 {
    constructor() {
        this.db = new HanaV1()
    }

    async listDatabasesAndSchemas() {
        if (this.db.getStatus() !== 'connected') {
            return {
                success: false,
                message: 'No active connection. Ensure the database is connected before querying.'
            }
        }

        try {
            const schemaQuery = `
                SELECT SCHEMA_NAME
                FROM SYS.SCHEMAS
                WHERE SCHEMA_NAME NOT LIKE '_SYS_%'
                  AND SCHEMA_NAME NOT LIKE 'SAP_%'
                  AND SCHEMA_NAME NOT IN (
                      'SYS', 'SYSTEM', 'HANACLEANER', 'RSP', 'HANA_XS_BASE'
                  )
            `
            const schemas = await this.db.executeQuery(schemaQuery)

            const results = {
                schemas: schemas.map(schema => schema.SCHEMA_NAME)
            }

            return {
                success: true,
                data: [
                    {
                        database: 'Hana',
                        schemas: results.schemas
                    }
                ]
            }
        } catch (error) {
            console.error('Error in listSchemas:', error)
            return {
                success: false,
                message: 'Error occurred while listing schemas.',
                error: error.message
            }
        }
    }
}

export default LSHanaV1