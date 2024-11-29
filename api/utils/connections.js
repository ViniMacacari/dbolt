import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

class DbConnections {
    constructor() {
        this.basePath = join(homedir(), 'Documents', 'dbolt', 'connections')
    }

    async ensureDirectoryExists() {
        try {
            await fs.mkdir(this.basePath, { recursive: true })
        } catch (error) {
            console.error(`Error creating directory at ${this.basePath}:`, error)
            throw error
        }
    }

    async saveConnectionsFile(newConnections) {
        await this.ensureDirectoryExists()
        const filePath = join(this.basePath, 'connections.json')

        try {
            await fs.writeFile(filePath, JSON.stringify(newConnections, null, 2), 'utf8')
            console.log('Connections saved successfully.')
        } catch (error) {
            console.error('Error saving connections file:', error)
            throw error
        }
    }

    async readConnectionsFile() {
        const filePath = join(this.basePath, 'connections.json')

        try {
            const data = await fs.readFile(filePath, 'utf8')
            return data ? JSON.parse(data) : []
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error('Connections file does not exist.')
                return []
            }
            console.error('Error reading connections file:', error)
            throw error
        }
    }

    async getConnectionById(id) {
        const connections = await this.readConnectionsFile()
        const connection = connections.find(conn => conn.id === id)

        if (!connection) {
            console.error(`Connection with ID ${id} not found.`)
            return null
        }

        return connection
    }

    async deleteConnectionById(id) {
        const filePath = join(this.basePath, 'connections.json')
        const connections = await this.readConnectionsFile()

        const updatedConnections = connections.filter(conn => conn.id !== id)

        if (connections.length === updatedConnections.length) {
            console.error(`Connection with ID ${id} not found.`)
            return false
        }

        try {
            await this.saveConnectionsFile(updatedConnections)
            console.log(`Connection with ID ${id} deleted successfully.`)
            return true
        } catch (error) {
            console.error('Error deleting connection:', error)
            throw error
        }
    }
}

export default new DbConnections()