import PgV1 from '../../../models/postgres/v9.js'

class SQueryPgV1 {
    constructor() {
        this.db = new PgV1()
    }

    async query(sql, maxLines = null) {
        if (maxLines && !this.hasLimitClause(sql) && this.isSelectQuery(sql)) {
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

    isSelectQuery(sql) {
        const trimmedSql = sql.trim().toLowerCase()

        const sqlWithoutComments = trimmedSql
            .split('\n')
            .map(line => line.trim())
            .filter(line => !line.startsWith('--'))
            .join(' ')

        const nonSelectKeywords = /^(insert|update|delete|alter|drop|create|truncate|merge|grant|revoke|exec|set|use|describe|explain|show|call|backup|restore|analyze|optimize|begin|commit|rollback)\b/

        return !nonSelectKeywords.test(sqlWithoutComments) && sqlWithoutComments.startsWith('select ')
    }
}

export default new SQueryPgV1()