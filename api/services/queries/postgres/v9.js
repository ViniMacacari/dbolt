import PgV1 from '../../../models/postgres/v9.js'

class SQueryPgV1 {
    constructor() {
        this.db = new PgV1()
    }

    async query(sql) {
        try {
            const result = await this.db.executeQuery(sql)

            return { success: true, result: result }
        } catch (error) {
            throw new Error(error)
        }
    }
}

export default new SQueryPgV1()