import HanaV1 from '../../../models/hana/hana-v1.js'

class SQuerysHana {
    constructor() {
        this.db = new HanaV1()
    }

    async query(sql, maxLines = null) {
        let totalRows = null
        if (this.isSelectQuery(sql)) {
            const countSql = this.getCountQuery(sql)
            try {
                const countResult = await this.db.executeQuery(countSql)
                totalRows = countResult[0]?.TOTAL_ROWS || null
            } catch (error) {
                throw {
                    success: false,
                    message: `Error fetching total rows: ${error.message || 'Unknown error'}`,
                    code: error.code || null
                }
            }
        }

        if (maxLines && !this.hasLimitClause(sql) && this.isSelectQuery(sql)) {
            sql = this.addLimitToQuery(sql, maxLines)
        }

        try {
            const result = await this.db.executeQuery(sql)

            if (result.length === 0) {
                const columnSql = this.addLimitToQuery(sql, 0)
                const columnsResult = await this.db.executeQuery(columnSql)
                const columns = Object.keys(columnsResult[0] || {})
                return {
                    success: true,
                    database: 'Hana',
                    result: [],
                    columns: columns,
                    totalRows: totalRows
                }
            }

            return {
                success: true,
                database: 'Hana',
                result: result,
                totalRows: totalRows
            }
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

    addLimitToQuery(sql, maxLines) {
        const trimmedSql = sql.trim()
        if (trimmedSql.toLowerCase().startsWith('with ')) {
            const lastSelectIndex = trimmedSql.lastIndexOf('select ')
            if (lastSelectIndex !== -1) {
                const beforeSelect = trimmedSql.slice(0, lastSelectIndex)
                const afterSelect = trimmedSql.slice(lastSelectIndex)
                return `${beforeSelect}${afterSelect.trim()} LIMIT ${maxLines}`
            }
        }
        return `${trimmedSql} LIMIT ${maxLines}`
    }

    getCountQuery(sql) {
        const trimmedSql = sql.trim().toLowerCase()
        if (trimmedSql.startsWith('select')) {
            const withoutOrderBy = sql.replace(/order\s+by\s+[^)]+$/gi, '')
            return `SELECT COUNT(*) AS TOTAL_ROWS FROM (${withoutOrderBy}) AS count_query`
        }
        throw new Error('Not a SELECT query for count calculation')
    }
}

export default new SQuerysHana()