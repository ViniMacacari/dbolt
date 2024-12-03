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

    async setSchema(schemaName) {
        try {
            if (!schemaName) {
                throw new Error('Schema name is required')
            }

            await this.db.executeQuery(`SET search_path TO ${schemaName}`)

            const currentSchema = await this.getSelectedSchema()
            return { success: true, message: `Schema changed to ${schemaName}`, currentSchema }
        } catch (error) {
            throw new Error(`Failed to set schema: ${error.message}`)
        }
    }
}

export default new SSPgV1()