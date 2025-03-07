import MySQLV1 from '../../../models/mysql/mysql5.js'

class LSMySQL1 {
    constructor() {
        this.db = new MySQLV1()
        this.mainConfig = null
    }

    async listDatabasesAndSchemas() {
        if (this.db.getStatus() !== 'connected') {
            return {
                success: false,
                message: 'No active connection. Ensure the database is connected before querying.'
            }
        }

        try {
            if (!this.mainConfig) {
                this.mainConfig = {
                    host: this.db.getConfig().host,
                    port: this.db.getConfig().port,
                    user: this.db.getConfig().user,
                    password: this.db.getConfig().password,
                    database: this.db.getConfig().database
                }
            }

            const databasesQuery = `SHOW DATABASES`
            const databases = await this.db.executeQuery(databasesQuery)

            const results = []

            for (const dbInfo of databases) {
                const { Database: database_name } = dbInfo

                if (['information_schema', 'mysql', 'performance_schema'].includes(database_name)) {
                    continue
                }

                results.push({
                    database: database_name,
                    schemas: ['mysql']
                })
            }

            if (results.length > 0) {
                const firstDatabase = results[0].database
                await this.db.connect({ ...this.mainConfig, database: firstDatabase })
            } else {
                await this.db.connect(this.mainConfig)
            }

            console.log('selected database', this.db.getConfig().database)
            return { success: true, data: results }
        } catch (error) {
            console.error('Error in listDatabasesAndSchemas:', error)
            return {
                success: false,
                message: 'Error occurred while listing databases and schemas.',
                error: error.message
            }
        }
    }
}

export default LSMySQL1