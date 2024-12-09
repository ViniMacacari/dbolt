import PgV1 from '../../../models/postgres/v9.js'

class SQueryPgV1 {
    constructor() {
        this.db = new PgV1()
    }

    async query(sql, maxLines = null) {
        if (maxLines && !this.hasLimitClause(sql)) {
            sql = `${sql.trim()} LIMIT ${maxLines}`
        }
        try {
            const result = await this.db.executeQuery(sql)
            return { success: true, result: result }
        } catch (error) {
            throw new Error(error)
        }
    }

    hasLimitClause(sql) {
        const lowerSql = sql.toLowerCase()
        return lowerSql.includes(' limit ') || lowerSql.includes(' offset ')
    }
}

export default new SQueryPgV1()