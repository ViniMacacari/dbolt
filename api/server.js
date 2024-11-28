import express from 'express'

import hanaV1 from './router/hana/hana-v1.js'

const app = express()
app.use(express.json())

const PORT = 47953

class InternalServer {
    loadServer() {
        app.use('/api/hana', hanaV1)

        app.listen(PORT, () => {
            console.log(`App listening on port ${PORT}`)
        })
    }
}

export default new InternalServer().loadServer()