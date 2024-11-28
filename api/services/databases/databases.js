class Databases {
    async avaliablesConnections() {
        return [
            {
                id: 1,
                database: 'Hana',
                service: 'hana-v1',
                version: 1,
                active: true
            }
        ]
    }
}

export default new Databases()