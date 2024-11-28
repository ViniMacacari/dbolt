import express from 'express'
import cors from 'cors'

import databases from './router/databases/databases.js'
import hanaV1 from './router/hana/hana-v1.js'

const app = express()

app.use(express.json())
app.use(cors())

const PORT = 47953

class InternalServer {
    loadServer() {
        app.use('/api/databases', databases)
        app.use('/api/hana', hanaV1)

        app.listen(PORT, () => {
            console.log(`App listening on port ${PORT}`)
        })
    }
}

export default new InternalServer().loadServer()