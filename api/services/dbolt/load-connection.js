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

    async getConnectionById(id) {
        try {
            const connections = await this.getAllConnections()
            const connection = connections.find((conn) => conn.id === id)

            if (!connection) {
                console.log(`Connection with ID ${id} not found.`)
                return null
            }

            console.log(`Connection with ID "${id}" loaded successfully:`, connection)
            return connection
        } catch (error) {
            console.error(`Error fetching connection with ID "${id}":`, error)
            throw new Error('Failed to fetch connection by ID')
        }
    }

    async deleteConnectionById(id) {
        try {
            const connections = await this.getAllConnections()
            const updatedConnections = connections.filter((conn) => conn.id !== id)

            if (connections.length === updatedConnections.length) {
                console.log(`Connection with ID ${id} not found. Nothing to delete.`)
                return false
            }

            await DbConnections.saveConnectionsFile(updatedConnections)
            console.log(`Connection with ID ${id} deleted successfully.`)
            return true
        } catch (error) {
            console.error(`Error deleting connection with ID "${id}":`, error)
            throw new Error('Failed to delete connection by ID')
        }
    }
}

export default new LoadConnections()