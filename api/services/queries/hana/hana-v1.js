import HanaV1 from '../../../models/hana/hana-v1.js'

class SQuerysHana {
    constructor() {
        this.db = new HanaV1()
    }

    async query(sql) {
        try {
            const result = await this.db.executeQuery(sql)

            return { success: true, database: 'Hana', result: result }
        } catch (error) {
            throw new Error(error.message)
        }
    }
}

export default new SQuerysHana()