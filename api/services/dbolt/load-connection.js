import DbConnections from '../../utils/connections.js'

class LoadConnections {
    async getAllConnections() {
        try {
            const connections = await DbConnections.readConnectionsFile()
            console.log('All connections loaded successfully:', connections)
            return connections
        } catch (error) {
            console.error('Error loading connections:', error)
            throw new Error('Failed to load connections')
        }
    }

    async getConnectionByDatabase(databaseName) {
        try {
            const connections = await this.getAllConnections()
            const filteredConnections = connections.filter(
                (connection) => connection.database.toLowerCase() === databaseName.toLowerCase()
            )

            if (filteredConnections.length === 0) {
                console.log(`No connections found for database: ${databaseName}`)
                return []
            }

            console.log(`Connections for database "${databaseName}" loaded successfully:`)
            return filteredConnections
        } catch (error) {
            console.error(`Error fetching connections for database "${databaseName}":`, error)
            throw new Error('Failed to fetch connections')
        }
    }
}

export default new LoadConnections()