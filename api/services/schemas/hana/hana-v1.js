import HanaV1 from '../../../models/hana/hana-v1.js'

class SSchemaHanaV1 {
    constructor() {
        this.db = new HanaV1()
    }

    async getSelectedSchema() {
        try {
            const result = await this.db.executeQuery(`SELECT SESSION_CONTEXT('CURRENT_SCHEMA') as "schema" FROM DUMMY`)

            return { success: true, database: 'Hana', schema: result[0].schema }
        } catch {
            throw new Error('Not connected to HANA')
        }
    }
}

export default new SSchemaHanaV1()