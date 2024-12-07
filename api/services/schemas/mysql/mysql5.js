import MySQLV1 from '../../../models/mysql/mysql5.js'

class SSMySQLV1 {
    constructor() {
        this.db = new MySQLV1()
    }

    async getSelectedDatabase() {
        if (!this.db.getStatus() === 'connected') {
            console.log('Reconnecting to MySQL...')
            await this.db.connect(this.db.getConfig())
        }

        try {
            const result = await this.db.executeQuery('SELECT DATABASE() AS `database`')

            if (!result[0].database) {
                throw new Error('No database selected')
            }

            return { success: true, database: result[0].database, schema: 'mysql' }
        } catch (error) {
            throw new Error(`Not connected to MySQL: ${error.message}`)
        }
    }

    async setDatabase(databaseName) {
        try {
            if (!databaseName) {
                throw new Error('Database name is required')
            }

            await this.db.disconnect()
            await this.db.connect({ ...this.db.getConfig(), database: databaseName })

            const currentDatabase = await this.getSelectedDatabase()
            return {
                success: true,
                message: `Connected to database "${databaseName}" successfully`,
                currentDatabase
            }
        } catch (error) {
            throw new Error(`Failed to set database: ${error.message}`)
        }
    }
}

export default new SSMySQLV1()