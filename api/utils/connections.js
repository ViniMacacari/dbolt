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
            let existingConnections = []

            try {
                const data = await fs.readFile(filePath, 'utf8')
                existingConnections = JSON.parse(data)
            } catch (error) {
                if (error.code !== 'ENOENT') throw error
            }

            const updatedConnections = [...existingConnections, ...newConnections]

            await fs.writeFile(filePath, JSON.stringify(updatedConnections, null, 2), 'utf8')
        } catch (error) {
            console.error('Error saving connections file:', error)
            throw error
        }
    }

    async readConnectionsFile() {
        const filePath = join(this.basePath, 'connections.json')

        try {
            const data = await fs.readFile(filePath, 'utf8')
            return JSON.parse(data)
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.error('Connections file does not exist.')
                return []
            }
            console.error('Error reading connections file:', error)
            throw error
        }
    }
}

export default new DbConnections()