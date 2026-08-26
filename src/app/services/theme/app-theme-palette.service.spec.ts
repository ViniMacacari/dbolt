import { TestBed } from '@angular/core/testing'

import { AppSettingsService, AppTheme, SqlHighlightMode } from '../app-settings/app-settings.service'
import { CacheManagerService } from '../cache/cache-manager.service'
import { AppThemePaletteService } from './app-theme-palette.service'

describe('AppThemePaletteService', () => {
  let service: AppThemePaletteService
  let settings: AppSettingsService

  const appThemes: AppTheme[] = ['dark', 'light', 'dracula', 'dark-gray']

  beforeEach(() => {
    localStorage.removeItem('app-settings')

    TestBed.configureTestingModule({
      providers: [CacheManagerService, AppSettingsService, AppThemePaletteService]
    })
    service = TestBed.inject(AppThemePaletteService)
    settings = TestBed.inject(AppSettingsService)
  })

  afterEach(() => {
    localStorage.removeItem('app-settings')
  })

  it('should be created', () => {
    expect(service).toBeTruthy()
  })

  it('exposes a palette for every app theme', () => {
    appThemes.forEach((theme) => {
      const palette = service.getEditorPalette(theme)

      expect(palette.contrastBackground).toMatch(/^#[0-9a-f]{6}$/)
      expect(palette.surfaceColors['editor.background']).toBeDefined()
      expect(Object.keys(service.getEditorChromeColors(theme)).length).toBeGreaterThan(0)
    })
  })

  it('falls back to the dark palette for an unknown theme', () => {
    expect(service.getEditorPalette('sepia' as AppTheme))
      .toBe(service.getEditorPalette('dark'))
  })

  it('keeps every built-in editor theme readable under every app theme', () => {
    const editorThemes = settings.sqlHighlightOptions
      .map((option) => option.value)
      .filter((mode): mode is Exclude<SqlHighlightMode, 'custom'> => mode !== 'custom')

    appThemes.forEach((theme) => {
      const background = service.getEditorPalette(theme).contrastBackground

      editorThemes.forEach((editorTheme) => {
        const resolved = service.resolveHighlightColors(theme, settings.getSqlHighlightPresetColors(editorTheme))

        Object.entries(resolved).forEach(([token, color]) => {
          const ratio = service.getContrastRatio(color, background)

          expect(ratio)
            .withContext(`${theme} / ${editorTheme} / ${token} (${color})`)
            .toBeGreaterThanOrEqual(service.minimumContrastRatio)
        })
      })
    })
  })

  it('does not repaint dark editor themes that already work on dark app themes', () => {
    const colors = settings.getSqlHighlightPresetColors('dbolt-dark')

    expect(service.resolveHighlightColors('dark', colors)).toEqual(colors)
    expect(service.resolveHighlightColors('dracula', colors)).toEqual(colors)
    expect(service.resolveHighlightColors('dark-gray', colors)).toEqual(colors)
  })

  it('darkens a low contrast color instead of discarding its hue on a light background', () => {
    const adjusted = service.adjustForContrast('#8be9fd', '#ffffff', '#005a9c')

    expect(adjusted).not.toBe('#005a9c')
    expect(service.hasAcceptableContrast(adjusted, '#ffffff')).toBeTrue()

    const [red, green, blue] = [1, 3, 5].map((index) => parseInt(adjusted.slice(index, index + 2), 16))
    expect(blue).toBeGreaterThan(red)
    expect(green).toBeGreaterThan(red)
  })

  it('lightens a low contrast color on a dark background', () => {
    const adjusted = service.adjustForContrast('#1f2933', '#282a36', '#f8f8f2')

    expect(service.hasAcceptableContrast(adjusted, '#282a36')).toBeTrue()
  })

  it('uses the theme fallback when a color cannot be adjusted', () => {
    expect(service.adjustForContrast('not-a-color', '#ffffff', '#005a9c')).toBe('#005a9c')
  })

  it('computes contrast ratios and rejects invalid colors', () => {
    expect(service.getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(service.getContrastRatio('#zzzzzz', '#000000')).toBeNull()
    expect(service.hasAcceptableContrast('#282a36', '#282a36')).toBeFalse()
  })
})
