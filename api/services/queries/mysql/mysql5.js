import MySQLV1 from '../../../models/mysql/mysql5.js'

class SQueryMySQLV1 {
    constructor() {
        this.db = new MySQLV1()
    }

    async query(sql, maxLines = null) {
        if (maxLines && !this.hasLimitClause(sql)) {
            sql = `${sql.trim()} LIMIT ${maxLines}`
        }
        try {
            const result = await this.db.executeQuery(sql)
            return { success: true, result: result }
        } catch (error) {
            console.error('Error executing query:', error)
            throw {
                success: false,
                message: error.message || 'Error executing query',
                code: error.code || null,
                sql: error.sql || null,
                sqlState: error.sqlState || null,
                errno: error.errno || null
            }
        }
    }

    hasLimitClause(sql) {
        const lowerSql = sql.toLowerCase()
        return lowerSql.includes(' limit ') || lowerSql.includes(' offset ')
    }
}

export default new SQueryMySQLV1()