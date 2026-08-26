import { TestBed } from '@angular/core/testing'

import { CacheManagerService } from '../cache/cache-manager.service'
import { AppSettingsService } from '../app-settings/app-settings.service'
import { AppThemeService } from './app-theme.service'

describe('AppThemeService', () => {
  let service: AppThemeService

  beforeEach(() => {
    localStorage.removeItem('app-settings')
    document.documentElement.removeAttribute('data-app-theme')
    document.documentElement.style.removeProperty('color-scheme')

    TestBed.configureTestingModule({
      providers: [CacheManagerService, AppSettingsService, AppThemeService]
    })
    service = TestBed.inject(AppThemeService)
  })

  afterEach(() => {
    localStorage.removeItem('app-settings')
    document.documentElement.removeAttribute('data-app-theme')
    document.documentElement.style.removeProperty('color-scheme')
  })

  it('keeps the existing dark theme as the default', () => {
    expect(service.getTheme()).toBe('dark')
    expect(document.documentElement.dataset['appTheme']).toBe('dark')
  })

  it('applies and persists the light theme without reloading', () => {
    expect(service.setTheme('light')).toBe('light')
    expect(service.getTheme()).toBe('light')
    expect(document.documentElement.dataset['appTheme']).toBe('light')
    expect(JSON.parse(localStorage.getItem('app-settings') || '{}').appTheme).toBe('light')
  })

  it('normalizes unsupported theme values back to dark', () => {
    expect(service.setTheme('system')).toBe('dark')
    expect(document.documentElement.dataset['appTheme']).toBe('dark')
  })

  it('applies the dracula theme with a dark color scheme', () => {
    expect(service.setTheme('dracula')).toBe('dracula')
    expect(document.documentElement.dataset['appTheme']).toBe('dracula')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(JSON.parse(localStorage.getItem('app-settings') || '{}').appTheme).toBe('dracula')
  })

  it('applies the dark gray theme with a dark color scheme', () => {
    expect(service.setTheme('dark-gray')).toBe('dark-gray')
    expect(document.documentElement.dataset['appTheme']).toBe('dark-gray')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('reports a light color scheme only for the light theme', () => {
    service.setTheme('light')
    expect(document.documentElement.style.colorScheme).toBe('light')

    service.setTheme('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('keeps the DBolt logo unchanged in the light theme', () => {
    const logo = document.createElement('img')
    logo.src = 'icons/dbolt-square.png'
    document.body.appendChild(logo)

    service.setTheme('light')

    expect(getComputedStyle(logo).filter).toBe('none')
    expect(getComputedStyle(logo).opacity).toBe('1')
    logo.remove()
  })
})
