import { DatabaseLogoService } from './database-logo.service'
import { AppThemeService } from '../theme/app-theme.service'
import type { AppTheme } from '../app-settings/app-settings.service'

describe('DatabaseLogoService', () => {
  let currentTheme: AppTheme
  let service: DatabaseLogoService

  beforeEach(() => {
    currentTheme = 'dark'
    service = new DatabaseLogoService({
      getTheme: () => currentTheme
    } as AppThemeService)
  })

  it('uses the light logo for every supported database on dark themes', () => {
    expect(service.path('Hana')).toBe('db-logo/hana-light.png')
    expect(service.path('MySQL')).toBe('db-logo/mysql-light.png')
    expect(service.path('Postgres')).toBe('db-logo/postgres-light.png')
    expect(service.path('SQLite')).toBe('db-logo/sqlite-light.png')
    expect(service.path('SqlServer')).toBe('db-logo/sqlserver-light.png')

    currentTheme = 'dracula'
    expect(service.path('Postgres')).toBe('db-logo/postgres-light.png')
  })

  it('uses the color logo on the light theme', () => {
    currentTheme = 'light'

    expect(service.path('Hana')).toBe('db-logo/hana-color.png')
    expect(service.path('MySQL')).toBe('db-logo/mysql-color.png')
    expect(service.path('Postgres')).toBe('db-logo/postgres-color.png')
    expect(service.path('SQLite')).toBe('db-logo/sqlite-color.png')
    expect(service.path('SqlServer')).toBe('db-logo/sqlserver-color.png')
  })

  it('normalizes aliases and falls back for an unknown database', () => {
    expect(service.path('SAP HANA')).toBe('db-logo/hana-light.png')
    expect(service.path('PostgreSQL')).toBe('db-logo/postgres-light.png')
    expect(service.path('Microsoft SQL Server')).toBe('db-logo/sqlserver-light.png')
    expect(service.path('ExampleDB')).toBe('icons/database.png')
    expect(service.path(null)).toBe('icons/database.png')
  })
})
