import SQLServerV1 from '../../../models/sqlserver/v2008.js'
import SSSQLServerV1 from '../../schemas/sqlserver/v2008.js'

class SQuerySQLServerV1 {
    constructor() {
        this.db = new SQLServerV1()
    }

    async query(sql, maxLines = null) {
        let totalRows = null

        sql = await this.adjustSchemaInQuery(sql)

        const cleanedSql = this.removeComments(sql)

        if (this.isSelectQuery(cleanedSql)) {
            const countSql = this.addTotalRowCountQuery(sql)
            try {
                const resultWithCount = await this.db.executeQuery(countSql)
                totalRows = resultWithCount[0]?.total_rows || 0
            } catch (error) {
                throw {
                    success: false,
                    message: `Error fetching total rows: ${error.message || 'Unknown error'}`,
                    code: error.code || null
                }
            }
        }

        if (maxLines && this.isSelectQuery(cleanedSql) && !this.hasLimitClause(cleanedSql)) {
            sql = this.addPaginationToQuery(sql, maxLines)
        }

        try {
            const result = await this.db.executeQuery(sql)
            return {
                success: true,
                result: result,
                totalRows: totalRows
            }
        } catch (error) {
            throw {
                success: false,
                message: error.message || 'Error executing query',
                code: error.code || null,
                sql: error.sql || null
            }
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

    addPaginationToQuery(sql, maxLines) {
        const trimmedSql = sql.trim()

        if (!this.hasOrderByClause(trimmedSql)) {
            sql = `${trimmedSql} ORDER BY (SELECT NULL)`
        }

        if (trimmedSql.toLowerCase().startsWith('with ')) {
            const lastSelectIndex = trimmedSql.lastIndexOf('select ')
            if (lastSelectIndex !== -1) {
                const beforeSelect = trimmedSql.slice(0, lastSelectIndex)
                const afterSelect = trimmedSql.slice(lastSelectIndex)
                return `${beforeSelect}${afterSelect.trim()} OFFSET 0 ROWS FETCH NEXT ${maxLines} ROWS ONLY`
            }
        }

        return `${sql} OFFSET 0 ROWS FETCH NEXT ${maxLines} ROWS ONLY`
    }

    addTotalRowCountQuery(sql) {
        const trimmedSql = this.removeComments(sql).trim()
        return `SELECT COUNT(*) OVER() AS total_rows, * FROM (${trimmedSql}) AS query_with_count`
    }

    async adjustSchemaInQuery(sql) {
        const currentSchemaResult = await SSSQLServerV1.getSelectedSchema()
        const currentSchema = currentSchemaResult.schema

        if (!currentSchema) {
            throw new Error('No schema selected')
        }

        const regex = /(?:from|join)\s+([\w\d]+(?:\.[\w\d]+)?)(\s+[as]?\s+\w+)?/gi

        const adjustedSql = sql.replace(regex, (match, table, alias) => {
            if (table.includes('.')) {
                return match
            }

            return match.replace(table, `${currentSchema}.${table}`)
        })

        return adjustedSql
    }
}

export default new SQuerySQLServerV1()