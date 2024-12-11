import MySQLV1 from '../../../models/mysql/mysql5.js'

class ListObjectsMySQLV1 {
    constructor() {
        this.db = new MySQLV1()
    }

    async listDatabaseObjects() {
        try {
            const tablesQuery = `
                SELECT TABLE_NAME AS name, 'table' AS type
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            `

            const viewsQuery = `
                SELECT TABLE_NAME AS name, 'view' AS type
                FROM INFORMATION_SCHEMA.VIEWS
                WHERE TABLE_SCHEMA = DATABASE()
                ORDER BY TABLE_NAME
            `

            const proceduresQuery = `
                SELECT ROUTINE_NAME AS name, 'procedure' AS type
                FROM INFORMATION_SCHEMA.ROUTINES
                WHERE ROUTINE_SCHEMA = DATABASE()
                  AND ROUTINE_TYPE = 'PROCEDURE'
                ORDER BY ROUTINE_NAME
            `

            const indexesQuery = `
                SELECT
                    TABLE_NAME AS table_name,
                    INDEX_NAME AS index_name,
                    INDEX_TYPE AS index_type,
                    'index' AS type
                FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                ORDER BY TABLE_NAME, INDEX_NAME
            `

            const tables = await this.db.executeQuery(tablesQuery)
            const views = await this.db.executeQuery(viewsQuery)
            const procedures = await this.db.executeQuery(proceduresQuery)
            const indexes = await this.db.executeQuery(indexesQuery)

            return {
                success: true,
                data: [
                    ...tables.map(obj => ({ ...obj, type: 'table' })),
                    ...views.map(obj => ({ ...obj, type: 'view' })),
                    ...procedures.map(obj => ({ ...obj, type: 'procedure' })),
                    ...indexes.map(obj => ({
                        name: obj.index_name,
                        table: obj.table_name,
                        index_type: obj.index_type,
                        type: 'index'
                    }))
                ]
            }
        } catch (error) {
            console.error('Error listing database objects:', error)
            return {
                success: false,
                message: 'Error occurred while listing database objects.',
                error: error.message
            }
        }
    }
}

export default new ListObjectsMySQLV1()