class Databases {
    async avaliablesConnections() {
        return [
            {
                id: 1,
                database: 'Hana',
                versions: [
                    {
                        name: 'v1',
                        service: 'hana-v1',
                        date: '2024-11-28'
                    }
                ],
                active: true
            }
        ]
    }
}

export default new Databases()