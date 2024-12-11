import QueryStorage from '../../utils/query-storage.js'
import loadSavedQueries from './load-query.js'

class SaveQuery {
    async newQuery(query) {
        try {
            const existingQueries = await loadSavedQueries.getAllQueries()

            const hasDuplicateName = existingQueries.some(
                (q) => q.name.toLowerCase() === query.name.toLowerCase()
            )

            const hasDuplicateDetails = existingQueries.some(
                (q) =>
                    q.sql.trim() === query.sql.trim()
            )

            if (hasDuplicateName || hasDuplicateDetails) {
                const errorMessage = hasDuplicateName
                    ? 'A query with the same name already exists.'
                    : 'A query with the same database, version, and SQL already exists.'
                throw new Error(errorMessage)
            }

            await QueryStorage.saveQueriesFile([query])

            return { success: true, message: 'Query saved successfully!' }
        } catch (error) {
            console.error('Error saving query:', error)
            throw error
        }
    }

    async updateExistingQuery(id, updatedData) {
        try {
            const updatedQuery = await QueryStorage.updateQueryById(id, updatedData)
            return { success: true, message: 'Query updated successfully', data: updatedQuery }
        } catch (error) {
            console.error('Error updating query:', error)
            throw new Error(`Error updating query: ${error.message}`)
        }
    }
}

export default new SaveQuery()