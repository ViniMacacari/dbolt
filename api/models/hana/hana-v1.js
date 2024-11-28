import hana from '@sap/hana-client'

class HanaV1 {
    constructor(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('A configuração de conexão é obrigatória e deve ser um objeto')
        }
        this.config = config
        this.connection = null
    }

    async connect() {
        if (this.connection) {
            console.warn('Já existe uma conexão ativa')
            return this.connection
        }

        try {
            this.connection = hana.createConnection()
            await this.connection.connect(this.config)
            console.log('Conexão com o SAP HANA estabelecida com sucesso')
            return this.connection
        } catch (error) {
            console.error('Erro ao conectar ao SAP HANA:', error)
            this.connection = null
            throw error
        }
    }

    async disconnect() {
        if (!this.connection) {
            console.warn('Nenhuma conexão ativa para desconectar')
            return
        }

        try {
            this.connection.disconnect()
            console.log('Conexão com o SAP HANA encerrada com sucesso')
        } catch (error) {
            console.error('Erro ao desconectar do SAP HANA:', error)
            throw error
        } finally {
            this.connection = null
        }
    }

    async executeQuery(query, params = []) {
        if (!this.connection) {
            throw new Error('Nenhuma conexão ativa. Conecte-se antes de executar uma consulta.')
        }

        try {
            return await new Promise((resolve, reject) => {
                const statement = this.connection.prepare(query)
                statement.exec(params, (err, results) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(results)
                    }
                })
            })
        } catch (error) {
            console.error('Erro ao executar a consulta:', error)
            throw error
        }
    }
}

export default HanaV1