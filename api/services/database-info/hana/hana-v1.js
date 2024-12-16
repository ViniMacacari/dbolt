import HanaV1 from '../../../models/hana/hana-v1.js'

class ListObjectsHanaV1 {
    constructor() {
        this.db = new HanaV1()
    }

    async listDatabaseObjects() {
        try {
            const tablesQuery = `
                SELECT TABLE_NAME AS name, 'table' AS type
                FROM PUBLIC.TABLES
                WHERE SCHEMA_NAME = CURRENT_SCHEMA
                ORDER BY TABLE_NAME
            `

            const viewsQuery = `
                SELECT VIEW_NAME AS name, 'view' AS type
                FROM PUBLIC.VIEWS
                WHERE SCHEMA_NAME = CURRENT_SCHEMA
                ORDER BY VIEW_NAME
            `

            const proceduresQuery = `
                SELECT PROCEDURE_NAME AS name, 'procedure' AS type
                FROM PUBLIC.PROCEDURES
                WHERE SCHEMA_NAME = CURRENT_SCHEMA
                ORDER BY PROCEDURE_NAME
            `

            const indexesQuery = `
                SELECT
                    INDEX_NAME AS index_name,
                    TABLE_NAME AS table_name,
                    'index' AS type
                FROM PUBLIC.INDEXES
                WHERE SCHEMA_NAME = CURRENT_SCHEMA
                ORDER BY TABLE_NAME, INDEX_NAME
            `

            const tables = await this.db.executeQuery(tablesQuery)
            const views = await this.db.executeQuery(viewsQuery)
            const procedures = await this.db.executeQuery(proceduresQuery)
            const indexes = {}

            return {
                success: true,
                data: [
                    ...tables.map(obj => ({ ...obj, type: 'table' })),
                    ...views.map(obj => ({ ...obj, type: 'view' })),
                    ...procedures.map(obj => ({ ...obj, type: 'procedure' })),
                ]
            }
        } catch (error) {
            console.error('Error listing database objects in HANA:', error)
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
                SELECT COLUMN_NAME AS name, DATA_TYPE_NAME AS type
                FROM SYS.TABLE_COLUMNS
                WHERE TABLE_NAME = '${tableName.toUpperCase()}'
                ORDER BY COLUMN_NAME
            `

            const columns = await this.db.executeQuery(columnsQuery)

            return {
                success: true,
                data: columns
            }
        } catch (error) {
            console.error('Error listing table columns in HANA:', error)
            return {
                success: false,
                message: 'Error occurred while listing table columns.',
                error: error.message
            }
        }
    }
}

export default new ListObjectsHanaV1()