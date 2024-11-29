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
            throw error
        }
    }

    async saveConnectionsFile(newConnections) {
        await this.ensureDirectoryExists()
        const filePath = join(this.basePath, 'connections.json')

        try {
            let existingConnections = []

            try {
                const data = await fs.readFile(filePath, 'utf8')
                existingConnections = data ? JSON.parse(data) : []
            } catch (error) {
                if (error.code !== 'ENOENT') throw error
            }

            const lastId = existingConnections.length > 0
                ? Math.max(...existingConnections.map(conn => conn.id || 0))
                : 0

            const updatedConnections = [
                ...existingConnections,
                ...newConnections.map((conn, index) => ({
                    id: lastId + index + 1,
                    ...conn
                }))
            ]

            await fs.writeFile(filePath, JSON.stringify(updatedConnections, null, 2), 'utf8')
        } catch (error) {
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
                return []
            }
            throw error
        }
    }

    async getConnectionById(id) {
        const connections = await this.readConnectionsFile()
        const connection = connections.find(conn => conn.id === Number(id))
        return connection || null
    }

    async deleteConnectionById(id) {
        const connections = await this.readConnectionsFile()
        const updatedConnections = connections.filter(conn => conn.id !== Number(id))

        if (connections.length === updatedConnections.length) {
            return false
        }

        try {
            const filePath = join(this.basePath, 'connections.json')
            await fs.writeFile(filePath, JSON.stringify(updatedConnections, null, 2), 'utf8')
            return true
        } catch (error) {
            throw error
        }
    }
}

export default new DbConnections()