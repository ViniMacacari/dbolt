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
}

export default new SSPgV1()