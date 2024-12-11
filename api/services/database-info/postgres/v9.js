import PgV1 from '../../../models/postgres/v9.js'

class ListObjectsPgV1 {
    constructor() {
        this.db = new PgV1()
    }

    async listDatabaseObjects() {
        try {
            const tablesQuery = `
                SELECT 
                    table_name AS name, 
                    'table' AS type 
                FROM information_schema.tables
                WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
                ORDER BY table_name
            `

            const viewsQuery = `
                SELECT 
                    table_name AS name, 
                    'view' AS type 
                FROM information_schema.views
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                ORDER BY table_name
            `

            const proceduresQuery = `
                SELECT 
                    routine_name AS name, 
                    'procedure' AS type
                FROM information_schema.routines
                WHERE specific_schema NOT IN ('pg_catalog', 'information_schema')
                ORDER BY routine_name
            `

            const indexesQuery = `
                SELECT 
                    i.relname AS index_name,
                    t.relname AS table_name,
                    a.amname AS index_type,
                    'index' AS type
                FROM pg_class t
                INNER JOIN pg_index ix ON t.oid = ix.indrelid
                INNER JOIN pg_class i ON i.oid = ix.indexrelid
                INNER JOIN pg_am a ON i.relam = a.oid
                WHERE t.relkind = 'r'
                ORDER BY t.relname, i.relname
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

export default new ListObjectsPgV1()