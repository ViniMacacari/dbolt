import SQLServerV1 from '../../../models/sqlserver/v2008.js'
import sql from 'mssql'

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

            const tables = await this.db.executeQuery(tablesQuery)
            const views = await this.db.executeQuery(viewsQuery)
            const procedures = await this.db.executeQuery(proceduresQuery)

            return {
                success: true,
                data: [
                    ...tables.map(obj => ({ ...obj, type: 'table' })),
                    ...views.map(obj => ({ ...obj, type: 'view' })),
                    ...procedures.map(obj => ({ ...obj, type: 'procedure' }))
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

export default new ListObjectsSQLServerV1()