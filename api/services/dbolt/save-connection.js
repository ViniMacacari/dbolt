import DbConnections from '../../utils/connections.js'
import loadConnection from './load-connection.js'

class SaveConnection {
    async newConnection(connection) {
        try {
            const existingConnections = await loadConnection.getAllConnections()

            const hasDuplicateName = existingConnections.some(
                (conn) => conn.name.toLowerCase() === connection.name.toLowerCase()
            )

            const hasDuplicateDetails = existingConnections.some(
                (conn) =>
                    conn.host.toLowerCase() === connection.host.toLowerCase() &&
                    conn.port === connection.port
            )

            if (hasDuplicateName || hasDuplicateDetails) {
                const errorMessage = hasDuplicateName
                    ? 'A connection with the same name already exists.'
                    : 'A connection with the same host and port already exists.'
                throw new Error(errorMessage)
            }

            await DbConnections.saveConnectionsFile([connection])

            return { success: true, message: 'Connection saved successfully!' }
        } catch (error) {
            console.error('Error saving connection:', error)
            throw error
        }
    }
}

export default new SaveConnection()