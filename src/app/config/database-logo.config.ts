export type DatabaseLogoName = 'hana' | 'mysql' | 'postgres' | 'sqlite' | 'sqlserver'

export const DATABASE_LOGO_BY_TYPE: Readonly<Record<string, DatabaseLogoName>> = {
  hana: 'hana',
  saphana: 'hana',
  mysql: 'mysql',
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  sqlserver: 'sqlserver',
  mssql: 'sqlserver',
  microsoftsqlserver: 'sqlserver'
}

export const DATABASE_LOGO_FALLBACK = 'icons/database.png'
