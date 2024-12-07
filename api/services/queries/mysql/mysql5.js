import MySQLV1 from '../../../models/mysql/mysql5.js'

class SQueryMySQLV1 {
    constructor() {
        this.db = new MySQLV1()
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

export default new SQueryMySQLV1()