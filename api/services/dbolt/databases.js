class Databases {
    async avaliablesConnections() {
        return [
            {
                id: 1,
                database: 'Hana',
                versions: [
                    {
                        name: 'global-version',
                        service: 'hana-v1',
                        date: '2024-11-28'
                    }
                ],
                active: true
            },
            {
                id: 2,
                database: 'Postgres',
                versions: [
                    {
                        name: 'v9',
                        service: 'v9',
                        date: '2024-11-28'
                    }
                ],
                active: true
            },
            {
                id: 3,
                database: 'MySQL',
                versions: [
                    {
                        name: 'v5',
                        service: 'mysql5',
                        date: '2024-12-07'
                    }
                ],
                active: true
            },
            {
                id: 4,
                database: 'SqlServer',
                versions: [
                    {
                        name: 'default-version',
                        service: 'v2019',
                        date: '2024-12-07'
                    },
                    {
                        name: '2008',
                        service: 'v2008',
                        date: '2024-12-07'
                    }
                ],
                active: true
            }
        ]
    }
}

export default new Databases()