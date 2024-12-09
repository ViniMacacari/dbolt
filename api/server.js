import express from 'express'
import cors from 'cors'

import databases from './router/dbolt/databases.js'
import connections from './router/dbolt/connections.js'
import query from './router/dbolt/query.js'

import hanaV1 from './router/hana/hana-v1.js'
import pgV9 from './router/postgres/v9.js'
import mysql5 from './router/mysql/mysql5.js'

const app = express()

app.use(express.json())
app.use(cors())

const PORT = 47953

class InternalServer {
    loadServer() {
        app.use('/api/databases', databases)
        app.use('/api/connections', connections)

        app.use('/api/Hana', hanaV1)
        app.use('/api/Postgres/v9', pgV9)
        app.use('/api/MySQL/v5', mysql5)

        app.listen(PORT, () => {
            console.log(`App listening on port ${PORT}`)
        })
    }
}

export default new InternalServer().loadServer()