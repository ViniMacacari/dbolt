import HanaV1 from '../../../models/hana/hana-v1.js'

class SQuerysHana {
    constructor() {
        this.db = new HanaV1()
    }

    async query(sql, maxLines = null) {
        if (maxLines && !this.hasLimitClause(sql)) {
            sql = `${sql.trim()} LIMIT ${maxLines}`
        }
        try {
            const result = await this.db.executeQuery(sql)
            return { success: true, database: 'Hana', result: result }
        } catch (error) {
            throw {
                success: false,
                message: error.message || 'Error executing query',
                code: error.code || null
            }
        }
    }

    hasLimitClause(sql) {
        const lowerSql = sql.toLowerCase()
        return lowerSql.includes(' limit ') || lowerSql.includes(' offset ')
    }
}

export default new SQuerysHana()