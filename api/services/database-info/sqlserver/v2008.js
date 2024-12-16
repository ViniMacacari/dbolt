import SQLServerV1 from '../../../models/sqlserver/v2008.js'

class ListObjectsSQLServerV1 {
    constructor() {
        this.db = new SQLServerV1()
    }

    async listDatabaseObjects() {
        try {
            const tablesQuery = `
                SELECT TABLE_NAME AS name, 'table' AS type
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
            `

            const viewsQuery = `
                SELECT TABLE_NAME AS name, 'view' AS type
                FROM INFORMATION_SCHEMA.VIEWS
                ORDER BY TABLE_NAME
            `

            const proceduresQuery = `
                SELECT ROUTINE_NAME AS name, 'procedure' AS type
                FROM INFORMATION_SCHEMA.ROUTINES
                WHERE ROUTINE_TYPE = 'PROCEDURE'
                ORDER BY ROUTINE_NAME
            `

            const indexesQuery = `
                SELECT
                    i.name AS index_name,
                    t.name AS table_name,
                    i.type_desc AS index_type,
                    'index' AS type
                FROM sys.indexes i
                INNER JOIN sys.tables t ON i.object_id = t.object_id
                WHERE i.is_primary_key = 0 AND i.is_unique_constraint = 0
                ORDER BY t.name, i.name
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

    async tableColumns(tableName) {
        try {
            const columnsQuery = `
                SELECT COLUMN_NAME AS name, DATA_TYPE AS type
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
            `

            const columns = await this.db.executeQuery(columnsQuery, [tableName])

            return {
                success: true,
                data: columns
            }
        } catch (error) {
            console.error('Error listing table columns:', error)
            return {
                success: false,
                message: 'Error occurred while listing table columns.',
                error: error.message
            }
        }
    }
}

export default new ListObjectsSQLServerV1()