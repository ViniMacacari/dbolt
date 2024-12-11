import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

class QueryStorage {
    constructor() {
        this.basePath = join(homedir(), 'Documents', 'dbolt', 'queries')
    }

    async ensureDirectoryExists() {
        try {
            await fs.mkdir(this.basePath, { recursive: true })
        } catch (error) {
            throw error
        }
    }

    async saveQueriesFile(newQueries) {
        await this.ensureDirectoryExists()
        const filePath = join(this.basePath, 'queries.json')

        try {
            let existingQueries = []

            try {
                const data = await fs.readFile(filePath, 'utf8')
                existingQueries = data ? JSON.parse(data) : []
            } catch (error) {
                if (error.code !== 'ENOENT') throw error
            }

            const lastId = existingQueries.length > 0
                ? Math.max(...existingQueries.map(query => query.id || 0))
                : 0

            const updatedQueries = [
                ...existingQueries,
                ...newQueries.map((query, index) => ({
                    id: lastId + index + 1,
                    ...query
                }))
            ]

            await fs.writeFile(filePath, JSON.stringify(updatedQueries, null, 2), 'utf8')
        } catch (error) {
            throw error
        }
    }

    async readQueriesFile() {
        const filePath = join(this.basePath, 'queries.json')

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

    async getQueryById(id) {
        const queries = await this.readQueriesFile()
        const query = queries.find(q => q.id === Number(id))
        return query || null
    }

    async deleteQueryById(id) {
        const queries = await this.readQueriesFile()
        const updatedQueries = queries.filter(q => q.id !== Number(id))

        if (queries.length === updatedQueries.length) {
            return false
        }

        try {
            const filePath = join(this.basePath, 'queries.json')
            await fs.writeFile(filePath, JSON.stringify(updatedQueries, null, 2), 'utf8')
            return true
        } catch (error) {
            throw error
        }
    }

    async updateQueryById(id, updatedData) {
        const queries = await this.readQueriesFile()
        const queryIndex = queries.findIndex(q => q.id === Number(id))

        if (queryIndex === -1) {
            throw new Error(`Query with id ${id} not found`)
        }

        const updatedQuery = {
            id: Number(id),
            ...updatedData
        }

        queries[queryIndex] = updatedQuery

        try {
            const filePath = join(this.basePath, 'queries.json')
            await fs.writeFile(filePath, JSON.stringify(queries, null, 2), 'utf8')
            return updatedQuery
        } catch (error) {
            throw error
        }
    }
}

export default new QueryStorage()