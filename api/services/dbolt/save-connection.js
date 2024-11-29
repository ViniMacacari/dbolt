import DbConnections from '../../utils/connections.js'

class SaveConnection {
    async newConnection(connection) {
        try {
            await DbConnections.saveConnectionsFile([connection])

            return { success: true, message: 'Connection saved successfully!' }
        } catch (error) {
            throw error
        }
    }
}

export default new SaveConnection()