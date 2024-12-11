import SQLServerV1 from '../../../models/sqlserver/v2008.js'

class SQuerySQLServerV1 {
    constructor() {
        this.db = new SQLServerV1()
    }

    async query(sql, maxLines = null) {
        const cleanedSql = this.removeComments(sql)

        if (maxLines && this.isSelectQuery(cleanedSql)) {
            if (!this.hasOrderByClause(cleanedSql)) {
                sql = `${sql.trim()} ORDER BY (SELECT NULL)`
            }
            sql = `${sql.trim()} OFFSET 0 ROWS FETCH NEXT ${maxLines} ROWS ONLY`
        }

        try {
            const result = await this.db.executeQuery(sql)
            return { success: true, result: result }
        } catch (error) {
            throw new Error(error.message || 'Error executing query')
        }
    }

    hasLimitClause(sql) {
        const cleanedSql = this.removeComments(sql)
        const lowerSql = cleanedSql.toLowerCase()
        return lowerSql.includes(' fetch next ') || lowerSql.includes(' offset ')
    }

    hasOrderByClause(sql) {
        const cleanedSql = this.removeComments(sql)
        const lowerSql = cleanedSql.toLowerCase()
        return lowerSql.includes(' order by ')
    }

    isSelectQuery(sql) {
        const cleanedSql = this.removeComments(sql).trim().toLowerCase()

        const nonSelectKeywords = /^(insert|update|delete|alter|drop|create|truncate|merge|grant|revoke|exec|set|use|describe|explain|show|call|backup|restore|analyze|optimize|begin|commit|rollback)\b/

        return !nonSelectKeywords.test(cleanedSql) && cleanedSql.startsWith('select ')
    }

    removeComments(sql) {
        return sql
            .replace(/--.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim()
    }
}

export default new SQuerySQLServerV1()