import { AppSettingsService } from './app-settings.service'
import { CacheManagerService } from '../cache/cache-manager.service'

describe('AppSettingsService SQL change highlights', () => {
  let service: AppSettingsService

  beforeEach(() => {
    localStorage.removeItem('app-settings')
    service = new AppSettingsService(new CacheManagerService())
  })

  afterEach(() => {
    localStorage.removeItem('app-settings')
  })

  it('shows SQL change highlights by default', () => {
    expect(service.shouldShowSqlChangeHighlights()).toBeTrue()
  })

  it('persists the preference when SQL change highlights are disabled', () => {
    const settings = service.setSqlChangeHighlightsEnabled(false)
    const stored = JSON.parse(localStorage.getItem('app-settings') || '{}')

    expect(settings.sqlChangeHighlightsEnabled).toBeFalse()
    expect(service.shouldShowSqlChangeHighlights()).toBeFalse()
    expect(stored.sqlChangeHighlightsEnabled).toBeFalse()
  })
})
