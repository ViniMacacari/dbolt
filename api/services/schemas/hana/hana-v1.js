import HanaV1 from '../../../models/hana/hana-v1.js'

class SSchemaHanaV1 {
    constructor() {
        this.db = new HanaV1()
    }

    async getSelectedSchema() {
        try {
            const result = await this.db.executeQuery(`SELECT CURRENT_SCHEMA AS "schema" FROM DUMMY`)

            return { success: true, database: 'Hana', schema: result[0].schema }
        } catch {
            throw new Error('Not connected to HANA')
        }
    }

    async setSchema(schemaName) {
        try {
            if (!schemaName) {
                throw new Error('Schema name is required')
            }

            await this.db.executeQuery(`SET SCHEMA ${schemaName}`)

            return { success: true, message: `Schema changed to ${schemaName}` }
        } catch (error) {
            throw new Error(`Failed to set schema: ${error.message}`)
        }
    }
}

export default new SSchemaHanaV1()